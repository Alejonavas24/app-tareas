import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { diffMinutes, fromMinutes, toEventMinute } from "../domain/time";
import type { EventConfig, HHMM, Phase, TimelineBlock, TimelineResult } from "../domain/types";
import { colors } from "../theme/tokens";

const SLOT_MINUTES = 15;
const GRID_WINDOW_MINUTES = 240;
const GANTT_WINDOW_MINUTES = 480;

export async function exportTimelinePdf(draft: EventConfig, result: TimelineResult): Promise<string> {
  const html = buildTimelinePdfHtml(draft, result);
  const printed = await Print.printToFileAsync({
    html,
    width: 842,
    height: 595,
    base64: false,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(printed.uri, {
      mimeType: "application/pdf",
      dialogTitle: fileName(draft),
      UTI: "com.adobe.pdf",
    });
  }

  return printed.uri;
}

function buildTimelinePdfHtml(draft: EventConfig, result: TimelineResult): string {
  const blocks = result.blocks;
  const timelineAnchor = blocks[0]?.start ?? draft.openDoorsTime;
  const range = getTimelineRange(blocks, timelineAnchor);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: ${colors.textStrong};
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8px;
    }
    h1, h2, p { margin: 0; }
    .cover {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid ${colors.line};
      padding-bottom: 6px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 16px;
      letter-spacing: 0;
    }
    h2 {
      color: ${colors.text};
      font-size: 10px;
      margin: 0 0 4px 178px;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(4, auto);
      gap: 6px;
      color: ${colors.text};
      text-align: right;
    }
    .metric {
      border: 1px solid ${colors.line};
      border-radius: 6px;
      padding: 4px 6px;
      white-space: nowrap;
    }
    .metric b {
      display: block;
      color: ${colors.textStrong};
      font-size: 10px;
    }
    .muted {
      color: ${colors.textMuted};
      font-weight: 400;
    }
    .gantt {
      position: relative;
      width: 100%;
      break-inside: avoid;
      page-break-inside: avoid;
      margin-bottom: 12px;
    }
    .gantt + .gantt {
      break-before: page;
      page-break-before: always;
    }
    .gantt-row {
      display: grid;
      grid-template-columns: 170px 1fr;
      gap: 8px;
      min-height: 20px;
      margin-bottom: 3px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .gantt-label {
      border-bottom: 1px solid ${colors.line};
      padding-bottom: 2px;
    }
    .gantt-label b {
      display: block;
      font-size: 7px;
      line-height: 8px;
    }
    .gantt-label span {
      display: block;
      color: ${colors.textMuted};
      font-size: 6px;
      line-height: 8px;
    }
    .track {
      position: relative;
      height: 18px;
      background: ${colors.canvas};
      border: 1px solid ${colors.line};
      border-radius: 4px;
      overflow: hidden;
    }
    .bar {
      position: absolute;
      top: 3px;
      height: 11px;
      border-radius: 3px;
      color: #fff;
      font-weight: 700;
      font-size: 6px;
      line-height: 11px;
      padding: 0 3px;
      white-space: nowrap;
      overflow: hidden;
    }
    .tick {
      position: absolute;
      top: 0;
      bottom: 0;
      border-left: 1px solid rgba(0,0,0,0.08);
    }
    .tick-label {
      position: absolute;
      top: -10px;
      transform: translateX(-50%);
      color: ${colors.textMuted};
      font-size: 6px;
    }
  </style>
</head>
<body>
  <section class="cover">
    <div>
      <h1>${escapeHtml(draft.name)}</h1>
      <p class="muted">${escapeHtml(draft.date)} · ${escapeHtml(String(draft.pax))} pax · ${escapeHtml(
        result.summary.startsAt ?? "--",
      )} a ${escapeHtml(result.summary.endsAt ?? "--")}</p>
    </div>
    <div class="meta">
      <div class="metric"><b>${result.summary.totalBlocks}</b>bloques</div>
      <div class="metric"><b>${result.summary.moduleCount}</b>modulos</div>
      <div class="metric"><b>${result.summary.assumptionCount}</b>supuestos</div>
      <div class="metric"><b>${result.summary.warningCount}</b>alertas</div>
    </div>
  </section>

  ${buildPagedGantt(blocks, timelineAnchor, range.minStart, range.maxEnd)}
</body>
</html>`;
}

function buildGridSections(blocks: TimelineBlock[], anchor: HHMM, minStart: number, maxEnd: number): string[] {
  const sections: string[] = [];
  const alignedStart = Math.floor(minStart / SLOT_MINUTES) * SLOT_MINUTES;
  const alignedEnd = Math.ceil(maxEnd / SLOT_MINUTES) * SLOT_MINUTES;

  for (let sectionStart = alignedStart; sectionStart < alignedEnd; sectionStart += GRID_WINDOW_MINUTES) {
    const sectionEnd = Math.min(sectionStart + GRID_WINDOW_MINUTES, alignedEnd);
    const ticks = buildTicks(sectionStart, sectionEnd, SLOT_MINUTES);
    const visibleBlocks = blocks.filter((block) => {
      const blockStart = toEventMinute(block.start, anchor);
      const blockEnd = blockStart + diffMinutes(block.start, block.end);
      return blockStart < sectionEnd && blockEnd > sectionStart;
    });

    sections.push(`
      <h3>${fromMinutes(sectionStart)} - ${fromMinutes(sectionEnd)}</h3>
      <table>
        <thead>
          <tr>
            <th class="label">Bloque</th>
            <th class="staff">Personas</th>
            <th class="phase">Fase</th>
            ${ticks.map((tick) => `<th class="time">${escapeHtml(fromMinutes(tick))}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${visibleBlocks.map((block) => buildGridRow(block, anchor, ticks)).join("")}
        </tbody>
      </table>
    `);
  }

  return sections;
}

function buildGridRow(block: TimelineBlock, anchor: HHMM, ticks: number[]): string {
  const blockStart = toEventMinute(block.start, anchor);
  const blockEnd = blockStart + diffMinutes(block.start, block.end);
  const color = blockColor(block);
  const firstActive = ticks.find((tick) => tick + SLOT_MINUTES > blockStart && tick < blockEnd);

  return `<tr>
    <td class="label">${escapeHtml(block.label)}<br><span class="muted">${escapeHtml(
      block.blockId ?? block.reference ?? "",
    )}</span></td>
    <td class="staff">${escapeHtml(staffLabel(block))}</td>
    <td class="phase">${escapeHtml(phaseLabel(block.phase))}<br><span class="muted">${escapeHtml(
      `${block.start}-${block.end}`,
    )}</span></td>
    ${ticks
      .map((tick) => {
        const active = tick + SLOT_MINUTES > blockStart && tick < blockEnd;
        const label = tick === firstActive ? `${block.start} ${block.durationMinutes}m` : "";
        return `<td class="grid-cell" style="${active ? `background:${color};` : ""}">${escapeHtml(label)}</td>`;
      })
      .join("")}
  </tr>`;
}

function buildPagedGantt(blocks: TimelineBlock[], anchor: HHMM, minStart: number, maxEnd: number): string {
  const alignedStart = Math.floor(minStart / SLOT_MINUTES) * SLOT_MINUTES;
  const alignedEnd = Math.ceil(maxEnd / SLOT_MINUTES) * SLOT_MINUTES;
  const sections: string[] = [];

  for (let sectionStart = alignedStart; sectionStart < alignedEnd; sectionStart += GANTT_WINDOW_MINUTES) {
    const sectionEnd = Math.min(sectionStart + GANTT_WINDOW_MINUTES, alignedEnd);
    sections.push(buildGanttSection(blocks, anchor, sectionStart, sectionEnd));
  }

  return sections.join("");
}

function buildGanttSection(blocks: TimelineBlock[], anchor: HHMM, sectionStart: number, sectionEnd: number): string {
  const span = Math.max(sectionEnd - sectionStart, 60);
  const tickStep = span <= 360 ? 15 : 30;
  const ticks = buildTicks(sectionStart, sectionEnd, tickStep);
  const visibleBlocks = blocks.filter((block) => {
    const blockStart = toEventMinute(block.start, anchor);
    const blockEnd = blockStart + diffMinutes(block.start, block.end);
    return blockStart < sectionEnd && blockEnd > sectionStart;
  });

  return `<div class="gantt">
    <h2>${escapeHtml(fromMinutes(sectionStart))} - ${escapeHtml(fromMinutes(sectionEnd))}</h2>
    <div style="height:12px; position:relative; margin-left:178px;">
      ${ticks
        .map((tick) => {
          const left = ((tick - sectionStart) / span) * 100;
          return `<span class="tick-label" style="left:${left}%;">${escapeHtml(fromMinutes(tick))}</span>`;
        })
        .join("")}
    </div>
    ${visibleBlocks
      .map((block) => {
        const blockStart = toEventMinute(block.start, anchor);
        const blockEnd = blockStart + diffMinutes(block.start, block.end);
        const clippedStart = Math.max(blockStart, sectionStart);
        const clippedEnd = Math.min(blockEnd, sectionEnd);
        const left = ((clippedStart - sectionStart) / span) * 100;
        const width = Math.max(((clippedEnd - clippedStart) / span) * 100, block.phase === "transicion" ? 2 : 4);
        return `<div class="gantt-row">
          <div class="gantt-label">
            <b>${escapeHtml(block.label)}</b>
            <span>${escapeHtml(`${phaseLabel(block.phase)} | ${block.start}-${block.end} | ${staffLabel(block)}`)}</span>
          </div>
          <div class="track">
            ${ticks
              .map((tick) => {
                const tickLeft = ((tick - sectionStart) / span) * 100;
                return `<span class="tick" style="left:${tickLeft}%;"></span>`;
              })
              .join("")}
            <div class="bar" style="left:${left}%; width:${width}%; background:${blockColor(block)};">
              ${escapeHtml(`${block.durationMinutes}m`)}
            </div>
          </div>
        </div>`;
      })
      .join("")}
  </div>`;
}

function buildGantt(blocks: TimelineBlock[], anchor: HHMM, minStart: number, maxEnd: number): string {
  const span = Math.max(maxEnd - minStart, 60);
  const tickStep = span <= 360 ? 15 : 30;
  const ticks = buildTicks(minStart, maxEnd, tickStep);

  return `<div class="gantt">
    <div style="height:12px; position:relative; margin-left:178px;">
      ${ticks
        .map((tick) => {
          const left = ((tick - minStart) / span) * 100;
          return `<span class="tick-label" style="left:${left}%;">${escapeHtml(fromMinutes(tick))}</span>`;
        })
        .join("")}
    </div>
    ${blocks
      .map((block) => {
        const start = toEventMinute(block.start, anchor) - minStart;
        const left = (start / span) * 100;
        const width = Math.max((block.durationMinutes / span) * 100, block.phase === "transicion" ? 2 : 4);
        return `<div class="gantt-row">
          <div class="gantt-label">
            <b>${escapeHtml(block.label)}</b>
            <span>${escapeHtml(`${phaseLabel(block.phase)} · ${block.start}-${block.end} · ${staffLabel(block)}`)}</span>
          </div>
          <div class="track">
            ${ticks
              .map((tick) => {
                const tickLeft = ((tick - minStart) / span) * 100;
                return `<span class="tick" style="left:${tickLeft}%;"></span>`;
              })
              .join("")}
            <div class="bar" style="left:${left}%; width:${width}%; background:${blockColor(block)};">
              ${escapeHtml(`${block.durationMinutes}m`)}
            </div>
          </div>
        </div>`;
      })
      .join("")}
  </div>`;
}

function buildNotes(result: TimelineResult): string {
  const notes = [
    ...result.assumptions.map((item) => `Supuesto: ${item.label} - ${item.detail}`),
    ...result.warnings.map((warning) => `Alerta: ${warning}`),
  ];

  if (notes.length === 0) {
    return "";
  }

  return `<section class="page-break">
    <h2>Supuestos y advertencias</h2>
    <div class="notes">${notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("")}</div>
  </section>`;
}

function getTimelineRange(blocks: TimelineBlock[], anchor: HHMM): { minStart: number; maxEnd: number } {
  if (blocks.length === 0) {
    const start = toEventMinute(anchor, anchor);
    return { minStart: start, maxEnd: start + 60 };
  }

  const minStart = Math.min(...blocks.map((block) => toEventMinute(block.start, anchor)));
  const maxEnd = Math.max(
    ...blocks.map((block) => toEventMinute(block.start, anchor) + diffMinutes(block.start, block.end)),
  );
  return { minStart, maxEnd };
}

function buildTicks(start: number, end: number, step: number): number[] {
  const ticks: number[] = [];
  for (let minute = start; minute <= end; minute += step) {
    ticks.push(minute);
  }
  return ticks;
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "previa":
      return "Previa";
    case "servicio":
      return "Servicio";
    case "posterior":
      return "Posterior";
    case "briefing":
      return "Briefing";
    case "transicion":
      return "Movimiento";
  }
}

function staffLabel(block: TimelineBlock): string {
  if (block.staffText) {
    return block.staffText;
  }
  if (block.staffMin != null && block.staffMax != null) {
    return block.staffMin === block.staffMax ? `${block.staffMin} pers.` : `${block.staffMin}-${block.staffMax} pers.`;
  }
  return block.team ?? "Equipo";
}

function blockColor(block: TimelineBlock): string {
  return colors.modules[(block.colorKey as keyof typeof colors.modules) ?? "taupe"] ?? colors.primary;
}

function fileName(draft: EventConfig): string {
  const raw = `timeline-${draft.name}-${draft.date}`;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
