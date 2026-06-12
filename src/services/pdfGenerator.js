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

        y = drawTableSection(doc, y, 'Remarks', data.remarks?.trim() || 'N/A');
        y = drawTableSection(doc, y, 'Billing Summary', buildBillingContent(data));

        // Photos
        const { savedImages } = data;
        if (savedImages && savedImages.length > 0) {
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
    };
}

// ─── 3-Column AC Units Table ─────────────────────────────────────────────────
/**
 * Draws a 3-column table:
 *  Col 1: AC Unit Details
 *  Col 2: Observations (Service) / Operation Test (Installation)
 *  Col 3: Actions Taken (Service) / Quality Checklist (Installation)
 * One row per AC unit. Header row repeats on each page break.
 */
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

        // Measure heights
        doc.fontSize(10).font('Helvetica');
        const h1 = measureLinesHeight(doc, col1, COL3_W - PAD * 2);
        const h2 = measureLinesHeight(doc, col2, COL3_W - PAD * 2);
        const h3 = measureLinesHeight(doc, col3, COL3_W - PAD * 2);
        let rowH = Math.max(h1, h2, h3, 30) + PAD * 2;

        // Page break: redraw header on new page
        if (y + rowH > PAGE_H - M - 80) {
            doc.addPage();
            y = M;
            y = drawTableHeaderRow(doc, y, headers);
        }

        // Border box for the row
        doc.rect(M, y, CW, rowH).strokeColor(C.border).lineWidth(BORDER_W).stroke();
        // Column dividers
        doc.moveTo(M + COL3_W, y).lineTo(M + COL3_W, y + rowH)
            .strokeColor(C.border).lineWidth(BORDER_W).stroke();
        doc.moveTo(M + COL3_W * 2, y).lineTo(M + COL3_W * 2, y + rowH)
            .strokeColor(C.border).lineWidth(BORDER_W).stroke();

        // Cell content
        drawCellLines(doc, col1, M + PAD, y + PAD, COL3_W - PAD * 2);
        drawCellLines(doc, col2, M + COL3_W + PAD, y + PAD, COL3_W - PAD * 2);
        drawCellLines(doc, col3, M + COL3_W * 2 + PAD, y + PAD, COL3_W - PAD * 2);

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

function measureLinesHeight(doc, content, width) {
    const lines = String(content).split('\n');
    let total = 0;
    lines.forEach(line => {
        total += doc.heightOfString(line, { width }) + 2;
    });
    return total;
}

function drawCellLines(doc, content, x, y, width) {
    const lines = String(content).split('\n');
    let lineY = y;
    lines.forEach((line) => {
        doc.fontSize(10).font('Helvetica').fillColor(C.text);
        doc.text(line, x, lineY, { width, lineGap: 2 });
        lineY = doc.y + 2;
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
        valueHeight = 3 * 14 + PAD * 2;
    } else {
        const lines = String(content).split('\n');
        doc.fontSize(10).font('Helvetica');
        let totalLineH = 0;
        lines.forEach(line => {
            const h = doc.heightOfString(line, { width: VALUE_COL_W - PAD * 2 });
            totalLineH += h + 2;
        });
        valueHeight = totalLineH + PAD * 2;
    }

    const labelHeight = doc.fontSize(10).font('Helvetica-Bold')
        .heightOfString(label, { width: LABEL_COL_W - PAD * 2 }) + PAD * 2;

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
        const { subtotal, tax, total } = content;
        doc.fontSize(10).font('Helvetica').fillColor(C.text);
        doc.text(`Subtotal: Rs. ${fmtAmount(subtotal)}`, vx, y + PAD, { width: vw });
        doc.text(`GST (18%): Rs. ${fmtAmount(tax)}`, vx, doc.y + 2, { width: vw });
        doc.fontSize(10).font('Helvetica-Bold').fillColor(C.text);
        doc.text(`Total: Rs. ${fmtAmount(total)}`, vx, doc.y + 2, { width: vw });
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

    // Centered heading across full page width
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

    const leftLines = [
        `Customer Name: ${customerName || 'N/A'}`,
        `Mobile: ${mobileNumber || 'N/A'}`,
        `Address: ${address || 'N/A'}`,
    ];
    const rightLines = [
        `Invoice No: ${invoiceNumber || 'N/A'}`,
        `DOP: ${fmtDate(dop)}`,
        `Engineer Name: ${engineerName || 'N/A'}`,
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

    // Box border thicker, NO vertical divider between the two boxes
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

function fmtDate(val) {
    if (!val) return 'N/A';
    try { return new Date(val).toLocaleDateString('en-IN'); } catch (_) { return String(val); }
}

module.exports = { generateReportPDF };