import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { diffMinutes, fromMinutes, toEventMinute } from "../domain/time";
import type { EventConfig, HHMM, Phase, TimelineBlock, TimelineResult } from "../domain/types";
import { colors } from "../theme/tokens";

const SLOT_MINUTES = 15;
const GRID_WINDOW_MINUTES = 240;

export async function exportTimelinePdf(draft: EventConfig, result: TimelineResult): Promise<string> {
  const html = buildTimelinePdfHtml(draft, result);
  const printed = await Print.printToFileAsync({
    html,
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
  const range = getTimelineRange(blocks, draft.openDoorsTime);
  const gridSections = buildGridSections(blocks, draft.openDoorsTime, range.minStart, range.maxEnd);

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
      font-size: 9px;
    }
    h1, h2, h3, p { margin: 0; }
    .cover {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid ${colors.line};
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    h1 {
      font-size: 20px;
      letter-spacing: 0;
    }
    h2 {
      font-size: 14px;
      margin: 14px 0 8px;
    }
    h3 {
      font-size: 11px;
      margin: 10px 0 6px;
      color: ${colors.textMedium};
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
      padding: 5px 7px;
      white-space: nowrap;
    }
    .metric b {
      display: block;
      color: ${colors.textStrong};
      font-size: 12px;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid ${colors.line};
      padding: 2px 3px;
      vertical-align: middle;
      overflow: hidden;
    }
    th {
      background: ${colors.canvas};
      color: ${colors.textMedium};
      font-weight: 700;
    }
    .label {
      width: 170px;
      font-weight: 700;
      color: ${colors.textStrong};
    }
    .staff {
      width: 72px;
      color: ${colors.text};
    }
    .phase {
      width: 58px;
      color: ${colors.text};
    }
    .time {
      width: 28px;
      text-align: center;
      font-size: 7px;
    }
    .grid-cell {
      height: 18px;
      text-align: center;
      color: #fff;
      font-weight: 700;
      font-size: 7px;
      line-height: 9px;
    }
    .muted {
      color: ${colors.textMuted};
      font-weight: 400;
    }
    .page-break {
      break-before: page;
      page-break-before: always;
    }
    .gantt {
      position: relative;
      width: 100%;
    }
    .gantt-row {
      display: grid;
      grid-template-columns: 188px 1fr;
      gap: 8px;
      min-height: 28px;
      margin-bottom: 5px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .gantt-label {
      border-bottom: 1px solid ${colors.line};
      padding-bottom: 3px;
    }
    .gantt-label b {
      display: block;
      font-size: 8px;
      line-height: 10px;
    }
    .gantt-label span {
      display: block;
      color: ${colors.textMuted};
      font-size: 7px;
      line-height: 9px;
    }
    .track {
      position: relative;
      height: 24px;
      background: ${colors.canvas};
      border: 1px solid ${colors.line};
      border-radius: 4px;
      overflow: hidden;
    }
    .bar {
      position: absolute;
      top: 4px;
      height: 14px;
      border-radius: 3px;
      color: #fff;
      font-weight: 700;
      font-size: 7px;
      line-height: 14px;
      padding: 0 4px;
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
      top: -12px;
      transform: translateX(-50%);
      color: ${colors.textMuted};
      font-size: 7px;
    }
    .notes {
      margin-top: 10px;
      color: ${colors.text};
      line-height: 13px;
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

  <h2>Grilla operativa</h2>
  ${gridSections.join("")}

  <section class="page-break">
    <h2>Vista Gantt</h2>
    ${buildGantt(blocks, draft.openDoorsTime, range.minStart, range.maxEnd)}
  </section>

  ${buildNotes(result)}
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

function buildGantt(blocks: TimelineBlock[], anchor: HHMM, minStart: number, maxEnd: number): string {
  const span = Math.max(maxEnd - minStart, 60);
  const tickStep = span <= 360 ? 15 : 30;
  const ticks = buildTicks(minStart, maxEnd, tickStep);

  return `<div class="gantt">
    <div style="height:14px; position:relative; margin-left:196px;">
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
