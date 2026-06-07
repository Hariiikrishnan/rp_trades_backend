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
    border: '#cccccc',
    sigBorder: '#999999',
    tableHeader: '#f5f5f5',
};

// ─── Row heights for table sections ──────────────────────────────────────────
const LABEL_COL_W = 130;
const VALUE_COL_W = CW - LABEL_COL_W;

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

        // Table sections differ by job type
        y = drawTableSection(doc, y, 'AC Unit Details', buildACUnitContent(data));

        if (data.jobType === 'Service') {
            y = drawTableSection(doc, y, 'Observations', buildObservationsContent(data));
            y = drawTableSection(doc, y, 'Actions Taken', buildActionsTakenContent(data));
        } else {
            y = drawTableSection(doc, y, 'Operation Test', buildOperationTestContent(data));
            y = drawTableSection(doc, y, 'Quality Checklist', buildQualityCheckContent(data));
        }

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

// ─── Content Builders ─────────────────────────────────────────────────────────

function buildACUnitContent(data) {
    const { indoorModel, indoorSerial, outdoorModel, outdoorSerial } = data;
    return [
        `Indoor Model: ${indoorModel || 'N/A'}`,
        `Serial: ${indoorSerial || 'N/A'}`,
        outdoorModel ? `Outdoor Model: ${outdoorModel}` : null,
        outdoorSerial ? `Outdoor Serial: ${outdoorSerial}` : null,
    ].filter(Boolean).join('\n');
}

function buildOperationTestContent(data) {
    const ot = data.operationTest || {};
    const v = (val) => (val !== undefined && val !== null && val !== '') ? val : 'N/A';
    return [
        `Ambient Temp: ${v(ot.ambient_temp)}°C | Room Temp: ${v(ot.room_temp)}°C | Grill Temp: ${v(ot.grill_temp)}°C`,
        `Suction Temp: ${v(ot.suction_temp)}°C | Discharge Temp: ${v(ot.discharge_temp)}°C`,
        `Voltage L1-N: ${v(ot.v_l1_n)}V | L1-N2: ${v(ot.v_l1_n2)}V | L2-3: ${v(ot.v_l2_3)}V | L3-1: ${v(ot.v_l3_1)}V`,
        `High P: ${v(ot.high_p)} | Low P: ${v(ot.low_p)} | Current: ${v(ot.current)}A`,
    ].join('\n');
}

function buildQualityCheckContent(data) {
    const qc = data.qualityCheck || {};
    const v = (val) => (val !== undefined && val !== null && val !== '') ? val : 'N/A';
    return [
        `Leak Test: ${v(qc.leak_test)} | Insulation Piping: ${v(qc.insulation_pipe)}`,
        `Insulation Flare: ${v(qc.insulation_flare)} | Drain Flow: ${v(qc.drain_flow)}`,
        `Field Setting: ${v(qc.field_setting)}`,
    ].join('\n');
}

function buildObservationsContent(data) {
    const obs = data.observation || {};
    const parts = [];
    if (Array.isArray(obs.issues) && obs.issues.length) {
        parts.push(obs.issues.join(', '));
    }
    if (obs.other) parts.push(obs.other);
    return parts.join('\n') || 'N/A';
}

function buildActionsTakenContent(data) {
    const act = data.actionTaken || {};
    const lines = [];
    if (Array.isArray(act.actions) && act.actions.length) {
        act.actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    }
    if (act.other) lines.push(`${lines.length + 1}. ${act.other}`);
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

// ─── Table Row Renderer ───────────────────────────────────────────────────────

/**
 * Draws a bordered two-column table row: label (left) | content (right).
 * content can be a plain string (multiline via \n) or a billing object.
 * Returns Y after the row.
 */
function drawTableSection(doc, y, label, content) {
    const PAD = 8;
    const isBilling = content && typeof content === 'object' && content.type === 'billing';

    // ── Measure required height ───────────────────────────────────────────────
    let valueHeight;
    if (isBilling) {
        // 3 lines: subtotal, gst, total (bold)
        valueHeight = 3 * 14 + PAD * 2;
    } else {
        const lines = String(content).split('\n');
        // Estimate each line's rendered height (PDFKit wraps at VALUE_COL_W)
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

    // Page break if needed
    if (y + rowH > PAGE_H - M - 80) {
        doc.addPage();
        y = M;
    }

    // ── Draw border box ───────────────────────────────────────────────────────
    doc.rect(M, y, CW, rowH).strokeColor(C.border).lineWidth(0.5).stroke();

    // Vertical divider between label and value
    doc.moveTo(M + LABEL_COL_W, y).lineTo(M + LABEL_COL_W, y + rowH)
        .strokeColor(C.border).lineWidth(0.5).stroke();

    // ── Label cell (bold, primary colour) ────────────────────────────────────
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.primary)
        .text(label, M + PAD, y + PAD, {
            width: LABEL_COL_W - PAD * 2,
            lineGap: 2,
        });

    // ── Value cell ────────────────────────────────────────────────────────────
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
        const lines = String(content).split('\n');
        let lineY = y + PAD;
        lines.forEach((line, idx) => {
            doc.fontSize(10).font('Helvetica').fillColor(C.text);
            doc.text(line, vx, lineY, { width: vw, lineGap: 2 });
            lineY = doc.y + 2;
        });
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

    doc.fontSize(14).font('Helvetica-Bold').fillColor(C.primary)
        .text(`${jobType === 'Service' ? 'Service' : 'Installation'} Certificate`, M, y);

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

        doc.rect(rowX, rowY, PHOTO_SZ, PHOTO_SZ).strokeColor(C.border).lineWidth(0.5).stroke();
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

    doc.rect(c1X, sigY, SIG_W, SIG_H).strokeColor(C.sigBorder).lineWidth(0.5).stroke();
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

    doc.rect(c2X, sigY, SIG_W, SIG_H).strokeColor(C.sigBorder).lineWidth(0.5).stroke();
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
        .strokeColor(C.border).lineWidth(0.5).stroke();
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.primary)
        .text('Thank you for choosing RP TRADERS.', M, footerY, { width: CW, align: 'center' });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function hLine(doc, y) {
    doc.moveTo(M, y).lineTo(PAGE_W - M, y).strokeColor(C.border).lineWidth(0.5).stroke();
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