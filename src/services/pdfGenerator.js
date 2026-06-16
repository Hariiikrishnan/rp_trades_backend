'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ─── Constants ───────────────────────────────────────────────────────────────
const LOGO_PATH = path.join(__dirname, '..', '..', 'uploads', 'reports', 'logo.jpeg');
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 40;
const CW = PAGE_W - M * 2;
const MID = M + CW / 2;
const COL_W = CW / 2 - 10;

const C = {
    primary: '#1a1a2e',
    text: '#333333',
    muted: '#555555',
    border: '#999999',
    sigBorder: '#999999',
    tableHeader: '#f5f5f5',
};

const BORDER_W = 1; // thicker borders/strokes everywhere
const SECTION_GAP = 14; // vertical gap between major sections

// 3-column layout widths for AC table
const COL3_W = CW / 3;

// ─── Public API ──────────────────────────────────────────────────────────────
function generateReportPDF(data, pdfPath) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: M, autoFirstPage: true });
        const stream = fs.createWriteStream(pdfPath);
        doc.pipe(stream);

        let y = drawHeader(doc, M, data.jobType);
        y = hLine(doc, y);
        y = drawCustomerAndInvoice(doc, y, data);
        y = hLine(doc, y + 4);
        y += 4;

        // 3-column AC unit table (one row per AC unit)
        y = drawACUnitsTable(doc, y, data);

        // Gap before Remarks / Billing
        y += SECTION_GAP;

        y = drawTableSection(doc, y, 'Remarks', data.remarks?.trim() || 'N/A');
        if (data.showBillingSummary !== false) {
            if (data.jobType === 'Installation') {
                y = drawInstallationBillingTable(doc, y, data);
            } else {
                y = drawTableSection(doc, y, 'Billing Summary', buildBillingContent(data));
            }
        }

        // Photos
        const { savedImages } = data;
        if (savedImages && savedImages.length > 0) {
            y += SECTION_GAP;
            y = drawPhotosSection(doc, y, savedImages);
        }

        // Signatures + footer
        drawSignaturesAndFooter(doc, y, data);

        doc.end();
        stream.on('finish', resolve);
        stream.on('error', reject);
    });
}

// ─── AC Units helpers (support both single-unit legacy data and acUnits[]) ──

function getACUnits(data) {
    if (Array.isArray(data.acUnits) && data.acUnits.length > 0) {
        return data.acUnits;
    }
    // Fallback: build a single AC unit from legacy top-level fields
    return [{
        id: data.indoorSerial || '',
        details: data.indoorModel || '',
        outdoorModel: data.outdoorModel,
        outdoorSerial: data.outdoorSerial,
        operationTest: data.operationTest,
        qualityCheck: data.qualityCheck,
        observation: data.observation,
        actionTaken: data.actionTaken,
    }];
}

function buildACDetailsContent(data, ac) {
    const lines = [
        `Details: ${ac.details || 'N/A'}`,
        `Serial No: ${ac.id || 'N/A'}`,
    ];
    if (ac.outdoorModel) lines.push(`Outdoor Model: ${ac.outdoorModel}`);
    if (ac.outdoorSerial) lines.push(`Outdoor Serial: ${ac.outdoorSerial}`);
    return lines.join('\n');
}

function buildOperationTestContent(ot) {
    ot = ot || {};
    const v = (val) => (val !== undefined && val !== null && val !== '') ? val : 'N/A';
    return [
        `Ambient Temp: ${v(ot.ambient_temp)}°C`,
        `Room Temp: ${v(ot.room_temp)}°C`,
        `Grill Temp: ${v(ot.grill_temp)}°C`,
        `Suction Temp: ${v(ot.suction_temp)}°C`,
        `Discharge Temp: ${v(ot.discharge_temp)}°C`,
        `Voltage L1-N: ${v(ot.v_l1_n)}V`,
        `Voltage L1-N2: ${v(ot.v_l1_n2)}V`,
        `Voltage L2-3: ${v(ot.v_l2_3)}V`,
        `Voltage L3-1: ${v(ot.v_l3_1)}V`,
        `High P: ${v(ot.high_p)}`,
        `Low P: ${v(ot.low_p)}`,
        `Current: ${v(ot.current)}A`,
    ].join('\n');
}

function buildQualityCheckContent(qc) {
    qc = qc || {};
    const v = (val) => (val !== undefined && val !== null && val !== '') ? val : 'N/A';
    return [
        `Leak Test: ${v(qc.leak_test)}`,
        `Insulation Piping: ${v(qc.insulation_pipe)}`,
        `Insulation Flare: ${v(qc.insulation_flare)}`,
        `Drain Water Flow: ${v(qc.drain_flow)}`,
        `Field Setting: ${v(qc.field_setting)}`,
    ].join('\n');
}

function buildObservationsContent(obs) {
    obs = obs || {};
    const parts = [];
    if (Array.isArray(obs.issues) && obs.issues.length) {
        obs.issues.forEach(issue => parts.push(issue));
    }
    if (obs.other) parts.push(obs.other);
    return parts.join('\n') || 'N/A';
}

function buildActionsTakenContent(act) {
    act = act || {};
    const lines = [];
    if (Array.isArray(act.actions) && act.actions.length) {
        act.actions.forEach((a) => lines.push(a));
    }
    if (act.other) lines.push(act.other);
    return lines.join('\n') || 'N/A';
}

function buildBillingContent(data) {
    const billing = data.billing || {};
    return {
        type: 'billing',
        subtotal: billing.subtotal,
        tax: billing.tax,
        total: billing.total,
        items: billing.items || [],
    };
}

// ─── 3-Column AC Units Table ─────────────────────────────────────────────────
function drawACUnitsTable(doc, y, data) {
    const isService = data.jobType === 'Service';
    const PAD = 8;

    const headers = isService
        ? ['AC Unit Details', 'Observations', 'Actions Taken']
        : ['AC Unit Details', 'Operation Test', 'Quality Checklist'];

    const acUnits = getACUnits(data);

    y = drawTableHeaderRow(doc, y, headers);

    acUnits.forEach((ac) => {
        const col1 = buildACDetailsContent(data, ac);
        const col2 = isService
            ? buildObservationsContent(ac.observation)
            : buildOperationTestContent(ac.operationTest);
        const col3 = isService
            ? buildActionsTakenContent(ac.actionTaken)
            : buildQualityCheckContent(ac.qualityCheck);

        const innerW = COL3_W - PAD * 2;

        const h1 = measureLinesHeight(doc, col1, innerW);
        const h2 = measureLinesHeight(doc, col2, innerW);
        const h3 = measureLinesHeight(doc, col3, innerW);
        let rowH = Math.max(h1, h2, h3) + PAD * 2;
        rowH = Math.max(rowH, 30);

        if (y + rowH > PAGE_H - M - 80) {
            doc.addPage();
            y = M;
            y = drawTableHeaderRow(doc, y, headers);
        }

        doc.rect(M, y, CW, rowH).strokeColor(C.border).lineWidth(BORDER_W).stroke();
        doc.moveTo(M + COL3_W, y).lineTo(M + COL3_W, y + rowH)
            .strokeColor(C.border).lineWidth(BORDER_W).stroke();
        doc.moveTo(M + COL3_W * 2, y).lineTo(M + COL3_W * 2, y + rowH)
            .strokeColor(C.border).lineWidth(BORDER_W).stroke();

        drawCellLines(doc, col1, M + PAD, y + PAD, innerW);
        drawCellLines(doc, col2, M + COL3_W + PAD, y + PAD, innerW);
        drawCellLines(doc, col3, M + COL3_W * 2 + PAD, y + PAD, innerW);

        y += rowH;
    });

    return y;
}

function drawTableHeaderRow(doc, y, headers) {
    const PAD = 6;
    const rowH = 24;

    if (y + rowH > PAGE_H - M - 80) {
        doc.addPage();
        y = M;
    }

    doc.rect(M, y, CW, rowH).fillAndStroke(C.tableHeader, C.border);
    doc.lineWidth(BORDER_W).strokeColor(C.border);
    doc.moveTo(M + COL3_W, y).lineTo(M + COL3_W, y + rowH).stroke();
    doc.moveTo(M + COL3_W * 2, y).lineTo(M + COL3_W * 2, y + rowH).stroke();
    doc.rect(M, y, CW, rowH).strokeColor(C.border).lineWidth(BORDER_W).stroke();

    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.primary);
    headers.forEach((h, i) => {
        doc.text(h, M + COL3_W * i + PAD, y + 7, { width: COL3_W - PAD * 2, align: 'center' });
    });

    return y + rowH;
}

/**
 * Measure total rendered height of multi-line content at fontSize 10 / Helvetica,
 * matching the font state used in drawCellLines. Resets font state before measuring
 * to avoid stale-state issues from prior doc.text()/heightOfString() calls.
 */
function measureLinesHeight(doc, content, width) {
    doc.font('Helvetica').fontSize(10);
    const lines = String(content).split('\n');
    let total = 0;
    lines.forEach(line => {
        total += doc.heightOfString(line, { width, lineGap: 2 });
    });
    return total;
}

/**
 * Render multi-line content. Y is advanced explicitly using heightOfString
 * (with the same width/options as the text call) rather than relying on doc.y,
 * which can be left in an inconsistent state by prior calls.
 */
function drawCellLines(doc, content, x, y, width) {
    const lines = String(content).split('\n');
    let lineY = y;
    lines.forEach((line) => {
        doc.fontSize(10).font('Helvetica').fillColor(C.text);
        const h = doc.heightOfString(line, { width, lineGap: 2 });
        doc.text(line, x, lineY, { width, lineGap: 2 });
        lineY += h;
    });
}

// ─── Generic Table Row Renderer (Remarks / Billing) ───────────────────────────

function drawTableSection(doc, y, label, content) {
    const PAD = 8;
    const LABEL_COL_W = 130;
    const VALUE_COL_W = CW - LABEL_COL_W;
    const isBilling = content && typeof content === 'object' && content.type === 'billing';

    let valueHeight;
    if (isBilling) {
        const hasItems = Array.isArray(content.items) && content.items.length > 0;
        const numLines = (hasItems ? content.items.length + 1 : 0) + (content.tax > 0 ? 3 : 2);
        const extraGaps = hasItems ? 18 : 0;
        valueHeight = numLines * 14 + extraGaps + PAD * 2;
    } else {
        valueHeight = measureLinesHeight(doc, content, VALUE_COL_W - PAD * 2) + PAD * 2;
    }

    doc.font('Helvetica-Bold').fontSize(10);
    const labelHeight = doc.heightOfString(label, { width: LABEL_COL_W - PAD * 2 }) + PAD * 2;

    const rowH = Math.max(valueHeight, labelHeight, 36);

    if (y + rowH > PAGE_H - M - 80) {
        doc.addPage();
        y = M;
    }

    doc.rect(M, y, CW, rowH).strokeColor(C.border).lineWidth(BORDER_W).stroke();
    doc.moveTo(M + LABEL_COL_W, y).lineTo(M + LABEL_COL_W, y + rowH)
        .strokeColor(C.border).lineWidth(BORDER_W).stroke();

    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.primary)
        .text(label, M + PAD, y + PAD, { width: LABEL_COL_W - PAD * 2, lineGap: 2 });

    const vx = M + LABEL_COL_W + PAD;
    const vw = VALUE_COL_W - PAD * 2;

    if (isBilling) {
        const { subtotal, tax, total, items } = content;
        let nextY = y + PAD;

        if (Array.isArray(items) && items.length > 0) {
            // Draw items table header
            doc.fontSize(9).font('Helvetica-Bold').fillColor(C.muted);
            doc.text('Item Description', vx, nextY, { width: vw - 150 });
            doc.text('Qty', vx + vw - 150, nextY, { width: 40, align: 'center' });
            doc.text('Rate', vx + vw - 110, nextY, { width: 50, align: 'right' });
            doc.text('Amount', vx + vw - 50, nextY, { width: 50, align: 'right' });
            nextY += 14;

            // Draw each item row
            doc.fontSize(9).font('Helvetica').fillColor(C.text);
            items.forEach((item) => {
                doc.text(item.desc || 'N/A', vx, nextY, { width: vw - 150 });
                doc.text(String(item.qty || 0), vx + vw - 150, nextY, { width: 40, align: 'center' });
                doc.text(fmtAmount(item.rate || 0), vx + vw - 110, nextY, { width: 50, align: 'right' });
                doc.text(fmtAmount(item.amount || 0), vx + vw - 50, nextY, { width: 50, align: 'right' });
                nextY += 14;
            });

            // Draw divider line
            doc.moveTo(vx, nextY - 2).lineTo(vx + vw, nextY - 2)
               .strokeColor(C.border).lineWidth(0.5).stroke();
            nextY += 4;
        }

        doc.fontSize(10).font('Helvetica').fillColor(C.text);
        doc.text(`Subtotal: Rs. ${fmtAmount(subtotal)}`, vx, nextY, { width: vw });
        nextY += 14;
        if (tax > 0) {
            doc.text(`GST (18%): Rs. ${fmtAmount(tax)}`, vx, nextY, { width: vw });
            nextY += 14;
        }
        doc.fontSize(10).font('Helvetica-Bold').fillColor(C.text);
        doc.text(`Total: Rs. ${fmtAmount(total)}`, vx, nextY, { width: vw });
    } else {
        drawCellLines(doc, content, vx, y + PAD, vw);
    }

    return y + rowH;
}

// ─── Header ──────────────────────────────────────────────────────────────────

function drawHeader(doc, y, jobType) {
    const logoSize = 72;
    if (fs.existsSync(LOGO_PATH)) {
        try { doc.image(LOGO_PATH, M, y, { width: logoSize, height: logoSize }); } catch (_) { }
    }

    const txtX = M + logoSize + 14;
    const txtW = CW - logoSize - 14;

    doc.fontSize(20).font('Helvetica-Bold').fillColor(C.primary)
        .text('RP TRADERS', txtX, y + 5, { width: txtW, align: 'center' });
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.muted)
        .text('Air Conditioner, Water Purifier Sales and Service', txtX, doc.y + 2, { width: txtW, align: 'center' });
    doc.fontSize(9).font('Helvetica').fillColor(C.muted)
        .text('No. 6/385, SF No. 68/1, Main Road, Thalakudi, Trichy - 621 216.', txtX, doc.y + 2, { width: txtW, align: 'center' });
    doc.text('Mob: 98948 53469, 83446 75936', txtX, doc.y + 1, { width: txtW, align: 'center' });

    y = Math.max(doc.y, y + logoSize) + 10;

    const title = `${jobType === 'Service' ? 'Service Report' : 'Installation Certificate'}`;
    doc.fontSize(14).font('Helvetica-Bold').fillColor(C.primary)
        .text(title, M, y, { width: CW, align: 'center' });

    return doc.y + 6;
}

// ─── Customer & Invoice ───────────────────────────────────────────────────────

function drawCustomerAndInvoice(doc, y, d) {
    const { customerName, mobileNumber, address, invoiceNumber, dop, commissioningDate, engineerName } = d;
    const col1X = M;
    const col2X = MID + 8;

    doc.fontSize(11).font('Helvetica-Bold').fillColor(C.primary);
    doc.text('Customer Details', col1X, y, { width: COL_W });
    doc.text('Invoice Details', col2X, y, { width: COL_W });

    y = doc.y + 3;
    doc.fontSize(10).font('Helvetica').fillColor(C.text);

    const capitalize = (s) => (s && typeof s === 'string') ? s.charAt(0).toUpperCase() + s.slice(1) : s;

    const leftLines = [
        `Customer Name: ${capitalize(customerName) || 'N/A'}`,
        `Mobile: ${mobileNumber || 'N/A'}`,
        `Address: ${address || 'N/A'}`,
    ];
    const rightLines = [
        `Invoice No: ${invoiceNumber || 'N/A'}`,
        `DOP: ${fmtDate(dop)}`,
        `Engineer Name: ${capitalize(engineerName) || 'N/A'}`,
        `Commissioning Date: ${fmtDate(commissioningDate)}`,
    ];

    let leftY = y, rightY = y;
    leftLines.forEach(line => {
        doc.text(line, col1X, leftY, { width: COL_W });
        leftY = doc.y + 2;
    });
    rightLines.forEach(line => {
        doc.text(line, col2X, rightY, { width: COL_W });
        rightY = doc.y + 2;
    });

    return Math.max(leftY, rightY) + 4;
}

// ─── Photos ───────────────────────────────────────────────────────────────────

function drawPhotosSection(doc, y, savedImages) {
    const PHOTO_SZ = 170;
    const PHOTO_GAP = 12;
    const PER_ROW = 3;
    const ROW_W = PER_ROW * PHOTO_SZ + (PER_ROW - 1) * PHOTO_GAP;
    const startX = M + (CW - ROW_W) / 2;
    const LABEL_H = 16;
    const ROW_STEP = PHOTO_SZ + LABEL_H + 8;

    if (y + PHOTO_SZ + 50 > PAGE_H - M - 100) {
        doc.addPage();
        y = M;
    }

    doc.fontSize(11).font('Helvetica-Bold').fillColor(C.primary).text('Photos', M, y, { width: CW });
    y = doc.y + 6;

    let colIdx = 0;
    let rowX = startX;
    let rowY = y;

    savedImages.forEach((img, i) => {
        const imgPath = path.join(__dirname, '..', '..', img.url);
        if (!fs.existsSync(imgPath)) return;

        if (rowY + ROW_STEP > PAGE_H - M - 100) {
            doc.addPage();
            rowY = M;
            colIdx = 0;
            rowX = startX;
        }

        doc.rect(rowX, rowY, PHOTO_SZ, PHOTO_SZ).strokeColor(C.border).lineWidth(BORDER_W).stroke();
        try {
            doc.image(imgPath, rowX + 2, rowY + 2, {
                fit: [PHOTO_SZ - 4, PHOTO_SZ - 4],
                align: 'center',
                valign: 'center',
            });
        } catch (_) { }

        doc.fontSize(9).font('Helvetica').fillColor(C.muted)
            .text(img.name || `Image ${i + 1}`, rowX, rowY + PHOTO_SZ + 3, { width: PHOTO_SZ, align: 'center' });

        colIdx++;
        if (colIdx >= PER_ROW) {
            colIdx = 0;
            rowX = startX;
            rowY += ROW_STEP;
        } else {
            rowX += PHOTO_SZ + PHOTO_GAP;
        }
    });

    if (colIdx > 0) rowY += ROW_STEP;
    return rowY + 6;
}

// ─── Signatures & Footer ─────────────────────────────────────────────────────

function drawSignaturesAndFooter(doc, y, data) {
    const { customerSigPath, engineerSigPath } = data;
    const SIG_W = 165;
    const SIG_H = 85;
    const LABEL_H = 20;
    const FOOTER_H = 30;
    const NEEDED = SIG_H + LABEL_H + FOOTER_H + 20;

    if (y + NEEDED > PAGE_H - M) {
        doc.addPage();
        y = M;
    }

    const sigY = y + 12;
    const c1X = M;
    const c2X = PAGE_W - M - SIG_W;

    doc.rect(c1X, sigY, SIG_W, SIG_H).strokeColor(C.sigBorder).lineWidth(BORDER_W * 1.5).stroke();
    if (customerSigPath && fs.existsSync(customerSigPath)) {
        try {
            doc.image(customerSigPath, c1X + 6, sigY + 6, {
                fit: [SIG_W - 12, SIG_H - 12],
                align: 'center',
                valign: 'center',
            });
        } catch (_) { }
    }
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.primary)
        .text('Customer Signature', c1X, sigY + SIG_H + 5, { width: SIG_W, align: 'center' });

    doc.rect(c2X, sigY, SIG_W, SIG_H).strokeColor(C.sigBorder).lineWidth(BORDER_W * 1.5).stroke();
    if (engineerSigPath && fs.existsSync(engineerSigPath)) {
        try {
            doc.image(engineerSigPath, c2X + 6, sigY + 6, {
                fit: [SIG_W - 12, SIG_H - 12],
                align: 'center',
                valign: 'center',
            });
        } catch (_) { }
    }
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.primary)
        .text('Engineer Signature', c2X, sigY + SIG_H + 5, { width: SIG_W, align: 'center' });

    const footerY = PAGE_H - M - 18;
    doc.moveTo(M, footerY - 8).lineTo(PAGE_W - M, footerY - 8)
        .strokeColor(C.border).lineWidth(BORDER_W).stroke();
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.primary)
        .text('Thank you for choosing RP TRADERS.', M, footerY, { width: CW, align: 'center' });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function hLine(doc, y) {
    doc.moveTo(M, y).lineTo(PAGE_W - M, y).strokeColor(C.border).lineWidth(BORDER_W).stroke();
    return y + 7;
}

function fmtAmount(val) {
    return (val != null && !isNaN(val)) ? Number(val).toFixed(2) : '0.00';
}

function drawInstallationBillingTable(doc, y, data) {
    const PAD = 4;
    const rowH = 20;
    const colWidths = [25, 160, 25, 25, 30, 50, 60, 50, 75, 15.28];
    const colX = [];
    let currentX = M;
    for (let w of colWidths) {
        colX.push(currentX);
        currentX += w;
    }

    const billing = data.billing || {};
    const items = billing.items || [];
    const applyGST = billing.tax > 0;
    const totalRowsCount = applyGST ? 3 : 1;

    const rows = [
        { desc: 'Installation', enabled: false, qty: '-', rate: '-', amount: '-' },
        { desc: 'Extra Wire', enabled: false, qty: '-', rate: '-', amount: '-' },
        { desc: 'Extra Pipe', enabled: false, qty: '-', rate: '-', amount: '-' },
        { desc: 'Angle Charge', enabled: false, qty: '-', rate: '-', amount: '-' },
        { desc: 'Vinayal Tape', enabled: false, qty: '-', rate: '-', amount: '-' }
    ];

    const customRows = [];

    function getPredefinedIndex(desc) {
        const d = desc.toLowerCase().trim();
        if (d.includes('installation')) return 0;
        if (d.includes('extra wire') || (d.includes('extra') && d.includes('wire'))) return 1;
        if (d.includes('extra pipe') || (d.includes('extra') && d.includes('pipe'))) return 2;
        if (d.includes('angle charge') || d === 'angle') return 3;
        if (d.includes('vinayal tape') || d.includes('vinyl tape') || d === 'vinayal' || d === 'vinyl') return 4;
        return -1;
    }

    items.forEach(item => {
        const desc = item.desc || '';
        const idx = getPredefinedIndex(desc);
        if (idx !== -1) {
            rows[idx].enabled = true;
            rows[idx].qty = item.qty;
            rows[idx].rate = item.rate;
            rows[idx].amount = item.amount;
        } else {
            customRows.push({
                desc: desc,
                enabled: true,
                qty: item.qty,
                rate: item.rate,
                amount: item.amount
            });
        }
    });

    const allRows = [...rows, ...customRows];
    if (customRows.length === 0) {
        allRows.push({ desc: '', enabled: null, qty: '', rate: '', amount: '' });
    }

    // Check height for entire table or at least header + first row
    if (y + rowH * 2 > PAGE_H - M - 80) {
        doc.addPage();
        y = M;
    }

    // Draw header row
    doc.rect(M, y, CW, rowH).fillAndStroke(C.tableHeader, C.border);
    doc.lineWidth(BORDER_W).strokeColor(C.border);
    for (let i = 1; i < colWidths.length; i++) {
        doc.moveTo(colX[i], y).lineTo(colX[i], y + rowH).stroke();
    }

    doc.fontSize(8).font('Helvetica-Bold').fillColor(C.primary);
    const headers = ['Sl.No.', 'DESCRIPTION', 'Yes', 'No', 'Qty.', 'Rate', 'Amount', 'Tax', 'TOTAL Rs.', 'P.'];
    headers.forEach((h, i) => {
        doc.text(h, colX[i] + PAD, y + 6, { width: colWidths[i] - PAD * 2, align: (i === 1) ? 'left' : 'center' });
    });
    
    y += rowH;

    // Draw body rows
    allRows.forEach((row, index) => {
        if (y + rowH > PAGE_H - M - 80) {
            doc.addPage();
            y = M;
            // Redraw header
            doc.rect(M, y, CW, rowH).fillAndStroke(C.tableHeader, C.border);
            doc.lineWidth(BORDER_W).strokeColor(C.border);
            for (let i = 1; i < colWidths.length; i++) {
                doc.moveTo(colX[i], y).lineTo(colX[i], y + rowH).stroke();
            }
            doc.fontSize(8).font('Helvetica-Bold').fillColor(C.primary);
            headers.forEach((h, i) => {
                doc.text(h, colX[i] + PAD, y + 6, { width: colWidths[i] - PAD * 2, align: (i === 1) ? 'left' : 'center' });
            });
            y += rowH;
        }

        // Draw row border & dividers
        doc.rect(M, y, CW, rowH).strokeColor(C.border).lineWidth(BORDER_W).stroke();
        for (let i = 1; i < colWidths.length; i++) {
            doc.moveTo(colX[i], y).lineTo(colX[i], y + rowH).stroke();
        }

        // Write row content
        doc.fontSize(9).font('Helvetica').fillColor(C.text);
        
        // Sl.No.
        if (row.desc !== '') {
            doc.text(String(index + 1), colX[0] + PAD, y + 5, { width: colWidths[0] - PAD * 2, align: 'center' });
        }

        // Description
        doc.text(row.desc, colX[1] + PAD, y + 5, { width: colWidths[1] - PAD * 2 });

        // Yes / No (via vector lines for tick/cross)
        if (row.enabled === true) {
            const cx = colX[2] + (colWidths[2] - 10) / 2;
            const cy = y + (rowH - 8) / 2;
            doc.moveTo(cx, cy + 4).lineTo(cx + 3, cy + 7).lineTo(cx + 8, cy + 1).strokeColor(C.primary).lineWidth(1.5).stroke();
        } else if (row.enabled === false) {
            const cx = colX[3] + (colWidths[3] - 8) / 2;
            const cy = y + (rowH - 8) / 2;
            doc.moveTo(cx, cy).lineTo(cx + 8, cy + 8).strokeColor(C.primary).lineWidth(1.5).stroke();
            doc.moveTo(cx + 8, cy).lineTo(cx, cy + 8).strokeColor(C.primary).lineWidth(1.5).stroke();
        }

        // Qty, Rate, Amount
        const qStr = (row.qty === '-' || row.qty === '') ? '-' : (typeof row.qty === 'number' ? row.qty.toString() : String(row.qty));
        const rStr = (row.rate === '-' || row.rate === '') ? '-' : fmtAmount(row.rate);
        const aStr = (row.amount === '-' || row.amount === '') ? '-' : fmtAmount(row.amount);

        doc.text(qStr, colX[4] + PAD, y + 5, { width: colWidths[4] - PAD * 2, align: 'center' });
        doc.text(rStr, colX[5] + PAD, y + 5, { width: colWidths[5] - PAD * 2, align: 'right' });
        doc.text(aStr, colX[6] + PAD, y + 5, { width: colWidths[6] - PAD * 2, align: 'right' });

        // Tax, Total, P are left blank on the rows
        y += rowH;
    });

    // Totals rows
    if (y + (rowH * totalRowsCount) > PAGE_H - M - 80) {
        doc.addPage();
        y = M;
    }

    const subtotal = billing.subtotal || 0;
    const tax = billing.tax || 0;
    const total = billing.total || 0;

    if (applyGST) {
        // Subtotal row
        doc.rect(colX[7], y, colWidths[7] + colWidths[8] + colWidths[9], rowH).strokeColor(C.border).lineWidth(BORDER_W).stroke();
        doc.moveTo(colX[8], y).lineTo(colX[8], y + rowH).stroke();
        doc.moveTo(colX[9], y).lineTo(colX[9], y + rowH).stroke();
        doc.fontSize(8).font('Helvetica-Bold').fillColor(C.primary);
        doc.text('Subtotal', colX[7] + PAD, y + 6, { width: colWidths[7] - PAD * 2, align: 'center' });
        doc.font('Helvetica').fillColor(C.text);
        doc.text(fmtAmount(subtotal), colX[8] + PAD, y + 6, { width: colWidths[8] - PAD * 2, align: 'right' });
        y += rowH;

        // GST row
        doc.rect(colX[7], y, colWidths[7] + colWidths[8] + colWidths[9], rowH).strokeColor(C.border).lineWidth(BORDER_W).stroke();
        doc.moveTo(colX[8], y).lineTo(colX[8], y + rowH).stroke();
        doc.moveTo(colX[9], y).lineTo(colX[9], y + rowH).stroke();
        doc.fontSize(8).font('Helvetica-Bold').fillColor(C.primary);
        doc.text('GST (18%)', colX[7] + PAD, y + 6, { width: colWidths[7] - PAD * 2, align: 'center' });
        doc.font('Helvetica').fillColor(C.text);
        doc.text(fmtAmount(tax), colX[8] + PAD, y + 6, { width: colWidths[8] - PAD * 2, align: 'right' });
        y += rowH;
    }

    // Grand Total row
    doc.rect(colX[7], y, colWidths[7] + colWidths[8] + colWidths[9], rowH).strokeColor(C.border).lineWidth(BORDER_W).stroke();
    doc.moveTo(colX[8], y).lineTo(colX[8], y + rowH).stroke();
    doc.moveTo(colX[9], y).lineTo(colX[9], y + rowH).stroke();
    doc.fontSize(8).font('Helvetica-Bold').fillColor(C.primary);
    doc.text('Grand Total', colX[7] + PAD, y + 6, { width: colWidths[7] - PAD * 2, align: 'center' });
    doc.font('Helvetica-Bold').fillColor(C.text);
    doc.text(fmtAmount(total), colX[8] + PAD, y + 6, { width: colWidths[8] - PAD * 2, align: 'right' });
    y += rowH;

    return y;
}

module.exports = { generateReportPDF };