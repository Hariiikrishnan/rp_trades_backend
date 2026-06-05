'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ─── Constants ──────────────────────────────────────────────────────────────
const LOGO_PATH = path.join(__dirname, '..', '..', 'uploads', 'reports', 'logo.jpeg');
const PAGE_W = 595.28;   // A4 width  (pt)
const PAGE_H = 841.89;   // A4 height (pt)
const M = 40;       // page margin
const CW = PAGE_W - M * 2;   // usable content width
const MID = M + CW / 2;       // horizontal mid-point
const COL_W = CW / 2 - 10;     // single column width (2-col layout)

const C = {
    primary: '#1a1a2e',
    text: '#333333',
    muted: '#555555',
    border: '#cccccc',
    sigBorder: '#999999',
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generates a service/installation report PDF.
 *
 * @param {Object} data
 * @param {string} data.jobType           - 'Installation' | 'Service'
 * @param {string} data.customerName
 * @param {string} data.mobileNumber
 * @param {string} data.address
 * @param {string} data.invoiceNumber
 * @param {string|Date} data.dop          - Date of Purchase
 * @param {string|Date} data.commissioningDate
 * @param {string} data.engineerName
 * @param {string} data.indoorModel
 * @param {string} data.indoorSerial
 * @param {string} data.outdoorModel
 * @param {string} data.outdoorSerial
 * @param {Object} data.operationTest
 * @param {Object} data.qualityCheck
 * @param {Object} data.observation       - Service only
 * @param {Object} data.actionTaken       - Service only
 * @param {Object} data.billing           - { subtotal, tax, total }
 * @param {string} data.remarks
 * @param {string} data.customerSigPath   - absolute path to PNG
 * @param {string} data.engineerSigPath   - absolute path to PNG
 * @param {Array}  data.savedImages       - [{ name, url }] relative url
 *
 * @param {string} pdfPath  - absolute output path
 * @returns {Promise<void>}
 */
function generateReportPDF(data, pdfPath) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: M, autoFirstPage: true });
        const stream = fs.createWriteStream(pdfPath);
        doc.pipe(stream);

        // 1. Draw all main content sections; get cursor Y back
        let y = drawMainContent(doc, data);

        // 2. Photos (may overflow to next page)
        const { savedImages } = data;
        if (savedImages && savedImages.length > 0) {
            y = drawPhotosSection(doc, y, savedImages);
        }

        // 3. Signatures + footer (always last, new page if needed)
        drawSignaturesAndFooter(doc, y, data);

        doc.end();
        stream.on('finish', resolve);
        stream.on('error', reject);
    });
}

// ─── Section Renderers ──────────────────────────────────────────────────────

/** Draws header through remarks. Returns Y after last element. */
function drawMainContent(doc, data) {
    const {
        jobType,
        customerName, mobileNumber, address,
        invoiceNumber, dop, commissioningDate, engineerName,
        indoorModel, indoorSerial, outdoorModel, outdoorSerial,
        operationTest, qualityCheck,
        observation, actionTaken,
        billing, remarks,
    } = data;

    // ── Header ──────────────────────────────────────────────────────────────
    let y = drawHeader(doc, M, jobType);

    // ── Divider ─────────────────────────────────────────────────────────────
    y = hLine(doc, y);

    // ── Customer Details  |  Invoice Details ────────────────────────────────
    y = drawCustomerAndInvoice(doc, y, {
        customerName, mobileNumber, address,
        invoiceNumber, dop, commissioningDate, engineerName,
    });

    // ── Divider ─────────────────────────────────────────────────────────────
    y = hLine(doc, y + 4);
    y += 4;

    // ── AC Unit Details ──────────────────────────────────────────────────────
    y = sectionTitle(doc, y, 'AC Unit Details');
    y += 2;

    const acLeftText = `Indoor Model: ${indoorModel || 'N/A'}\nIndoor Serial: ${indoorSerial || 'N/A'}`;
    const acRightText = `Outdoor Model: ${outdoorModel || 'N/A'}\nOutdoor Serial: ${outdoorSerial || 'N/A'}`;
    y = draw2ColText(doc, y, acLeftText, acRightText);
    y += 8;

    // ── Operation Test  |  Quality Checklist ────────────────────────────────
    y = drawOpTestAndQuality(doc, y, operationTest, qualityCheck, jobType);

    // ── Service-only sections ────────────────────────────────────────────────
    if (jobType === 'Service') {
        const hasObs = observation && (
            (Array.isArray(observation.issues) && observation.issues.length) ||
            observation.other
        );
        if (hasObs) {
            y = sectionTitle(doc, y, 'Observation Details');
            y += 2;
            const lines = [];
            if (Array.isArray(observation.issues) && observation.issues.length)
                lines.push(`Issues: ${observation.issues.join(', ')}`);
            if (observation.other)
                lines.push(`Other: ${observation.other}`);
            doc.fontSize(10).font('Helvetica').fillColor(C.text).text(lines.join('\n'), M, y, { width: CW });
            y = doc.y + 8;
        }

        const hasAct = actionTaken && (
            (Array.isArray(actionTaken.actions) && actionTaken.actions.length) ||
            actionTaken.other
        );
        if (hasAct) {
            y = sectionTitle(doc, y, 'Action Taken');
            y += 2;
            const lines = [];
            if (Array.isArray(actionTaken.actions) && actionTaken.actions.length)
                lines.push(`Actions: ${actionTaken.actions.join(', ')}`);
            if (actionTaken.other)
                lines.push(`Other: ${actionTaken.other}`);
            doc.fontSize(10).font('Helvetica').fillColor(C.text).text(lines.join('\n'), M, y, { width: CW });
            y = doc.y + 8;
        }
    }

    // ── Billing Summary ──────────────────────────────────────────────────────
    y = sectionTitle(doc, y, 'Billing Summary');
    y += 2;
    doc.fontSize(10).font('Helvetica').fillColor(C.text);
    doc.text(`Subtotal: Rs. ${fmtAmount(billing?.subtotal)}`, M, y, { width: CW });
    y = doc.y + 2;
    doc.text(`GST (18%): Rs. ${fmtAmount(billing?.tax)}`, M, y, { width: CW });
    y = doc.y + 2;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(C.text);
    doc.text(`Total: Rs. ${fmtAmount(billing?.total)}`, M, y, { width: CW });
    y = doc.y + 10;

    // ── Remarks ──────────────────────────────────────────────────────────────
    if (remarks && remarks.trim()) {
        y = sectionTitle(doc, y, 'Remarks');
        y += 2;
        doc.fontSize(10).font('Helvetica').fillColor(C.text).text(remarks.trim(), M, y, { width: CW });
        y = doc.y + 10;
    }

    return y;
}

/** Draws the page header. Returns Y after header. */
function drawHeader(doc, y, jobType) {
    const logoSize = 72;

    // Company logo (left)
    if (fs.existsSync(LOGO_PATH)) {
        try { doc.image(LOGO_PATH, M, y, { width: logoSize, height: logoSize }); } catch (_) { }
    }

    // Company text block (right of logo, centered in remaining space)
    const txtX = M + logoSize + 14;
    const txtW = CW - logoSize - 14;

    doc.fontSize(20).font('Helvetica-Bold').fillColor(C.primary)
        .text('RP TRADERS', txtX, y + 5, { width: txtW, align: 'center' });

    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.muted)
        .text('Air Conditioner, Water Purifier Sales and Service', txtX, doc.y + 2, { width: txtW, align: 'center' });

    doc.fontSize(9).font('Helvetica').fillColor(C.muted)
        .text('No. 6/385, SF No. 68/1, Main Road, Thalakudi, Trichy - 621 216.', txtX, doc.y + 2, { width: txtW, align: 'center' });

    doc.text('Mob: 98948 53469, 83446 75936', txtX, doc.y + 1, { width: txtW, align: 'center' });

    // Advance y to below the logo or text block (whichever is taller)
    y = Math.max(doc.y, y + logoSize) + 10;

    // Certificate title
    doc.fontSize(14).font('Helvetica-Bold').fillColor(C.primary)
        .text(`${jobType === 'Service' ? 'Service' : 'Installation'} Certificate`, M, y);

    return doc.y + 6;
}

/** Draws Customer Details (left) | Invoice Details (right). Returns Y after block. */
function drawCustomerAndInvoice(doc, y, d) {
    const { customerName, mobileNumber, address, invoiceNumber, dop, commissioningDate, engineerName } = d;

    const col1X = M;
    const col2X = MID + 8;

    // Section headers on same line
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

/** Draws Operation Test (left) | Quality Checklist (right). Returns Y after block. */
function drawOpTestAndQuality(doc, y, operationTest, qualityCheck, jobType) {
    const col1X = M;
    const col2X = MID + 8;

    // Section headers
    doc.fontSize(11).font('Helvetica-Bold').fillColor(C.primary).text('Operation Test', col1X, y, { width: COL_W });
    if (jobType !== 'Service' && qualityCheck) {
        doc.text('Quality Checklist', col2X, y, { width: COL_W });
    }
    y = doc.y + 3;

    let leftY = y, rightY = y;
    doc.fontSize(10).font('Helvetica').fillColor(C.text);

    if (operationTest) {
        const ot = operationTest;
        const v = (val) => (val !== undefined && val !== null && val !== '') ? val : 'N/A';

        const otLines = [
            `Ambient Temp: ${v(ot.ambient_temp)}°C | Room Temp: ${v(ot.room_temp)}°C | Grill Temp: ${v(ot.grill_temp)}°C`,
            `Suction Temp: ${v(ot.suction_temp)}°C | Discharge Temp: ${v(ot.discharge_temp)}°C`,
            `Voltage L1-N: ${v(ot.v_l1_n)}V | L1-N2: ${v(ot.v_l1_n2)}V | L2-3: ${v(ot.v_l2_3)}V | L3-1: ${v(ot.v_l3_1)}V`,
            `High P: ${v(ot.high_p)} | Low P: ${v(ot.low_p)} | Current: ${v(ot.current)}A`,
        ];
        otLines.forEach(line => {
            doc.text(line, col1X, leftY, { width: COL_W });
            leftY = doc.y + 2;
        });
    }

    if (jobType !== 'Service' && qualityCheck) {
        const qc = qualityCheck;
        const v = (val) => (val !== undefined && val !== null && val !== '') ? val : 'N/A';

        const qcLines = [
            `Leak Test: ${v(qc.leak_test)} | Insulation Piping: ${v(qc.insulation_pipe)}`,
            `Insulation Flare: ${v(qc.insulation_flare)} | Drain Flow: ${v(qc.drain_flow)}`,
            `Field Setting: ${v(qc.field_setting)}`,
        ];
        qcLines.forEach(line => {
            doc.text(line, col2X, rightY, { width: COL_W });
            rightY = doc.y + 2;
        });
    }

    return Math.max(leftY, rightY) + 8;
}

/** Draws photos grid (3 per row, 170×170). Returns Y after last row. */
function drawPhotosSection(doc, y, savedImages) {
    const PHOTO_SZ = 170;
    const PHOTO_GAP = 12;
    const PER_ROW = 3;
    const ROW_W = PER_ROW * PHOTO_SZ + (PER_ROW - 1) * PHOTO_GAP;
    const startX = M + (CW - ROW_W) / 2;
    const LABEL_H = 16;  // height for image name text below photo
    const ROW_STEP = PHOTO_SZ + LABEL_H + 8; // full height per row

    // Start photos section header — add page if too little room
    if (y + PHOTO_SZ + 50 > PAGE_H - M - 100) {
        doc.addPage();
        y = M;
    }

    y = sectionTitle(doc, y, 'Photos');
    y += 6;

    let colIdx = 0;
    let rowX = startX;
    let rowY = y;

    savedImages.forEach((img, i) => {
        const imgPath = path.join(__dirname, '..', '..', img.url);
        if (!fs.existsSync(imgPath)) return;

        // Page-break if next photo would overflow
        if (rowY + ROW_STEP > PAGE_H - M - 100) {
            doc.addPage();
            rowY = M;
            colIdx = 0;
            rowX = startX;
        }

        // Box + image
        doc.rect(rowX, rowY, PHOTO_SZ, PHOTO_SZ).strokeColor(C.border).lineWidth(0.5).stroke();
        try {
            doc.image(imgPath, rowX + 2, rowY + 2, {
                fit: [PHOTO_SZ - 4, PHOTO_SZ - 4],
                align: 'center',
                valign: 'center',
            });
        } catch (_) { }

        // Label below image
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

    // Advance past last partial row
    if (colIdx > 0) rowY += ROW_STEP;

    return rowY + 6;
}

/** Draws signatures side-by-side, then footer at page bottom. */
function drawSignaturesAndFooter(doc, y, data) {
    const { customerSigPath, engineerSigPath } = data;

    const SIG_W = 165;
    const SIG_H = 85;
    const LABEL_H = 20;
    const FOOTER_H = 30;
    const NEEDED = SIG_H + LABEL_H + FOOTER_H + 20;

    // New page if signatures + footer won't fit
    if (y + NEEDED > PAGE_H - M) {
        doc.addPage();
        y = M;
    }

    const sigY = y + 12;
    const c1X = M;
    const c2X = PAGE_W - M - SIG_W;

    // ── Customer Signature box ────────────────────────────────────────────────
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

    // ── Engineer Signature box ────────────────────────────────────────────────
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

    // ── Footer ────────────────────────────────────────────────────────────────
    // Always pin to the very bottom of the current page
    const footerY = PAGE_H - M - 18;
    doc.moveTo(M, footerY - 8).lineTo(PAGE_W - M, footerY - 8)
        .strokeColor(C.border).lineWidth(0.5).stroke();
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.primary)
        .text('Thank you for choosing RP TRADERS.', M, footerY, { width: CW, align: 'center' });
}

// ─── Tiny Utilities ──────────────────────────────────────────────────────────

/** Draws a full-width horizontal rule. Returns Y below the rule. */
function hLine(doc, y) {
    doc.moveTo(M, y).lineTo(PAGE_W - M, y).strokeColor(C.border).lineWidth(0.5).stroke();
    return y + 7;
}

/** Draws a bold section heading. Returns Y after heading. */
function sectionTitle(doc, y, title) {
    doc.fontSize(11).font('Helvetica-Bold').fillColor(C.primary).text(title, M, y, { width: CW });
    return doc.y + 2;
}

/**
 * Renders two text blocks side-by-side (each pre-formatted with \n).
 * Returns Y after the taller column.
 */
function draw2ColText(doc, y, leftText, rightText) {
    const col1X = M;
    const col2X = MID + 8;
    let leftY = y, rightY = y;

    doc.fontSize(10).font('Helvetica').fillColor(C.text);
    leftText.split('\n').forEach(line => {
        doc.text(line, col1X, leftY, { width: COL_W });
        leftY = doc.y + 2;
    });
    rightText.split('\n').forEach(line => {
        doc.text(line, col2X, rightY, { width: COL_W });
        rightY = doc.y + 2;
    });

    return Math.max(leftY, rightY);
}

/** Format currency amount */
function fmtAmount(val) {
    return (val != null && !isNaN(val)) ? Number(val).toFixed(2) : '0.00';
}

/** Format date value to locale string */
function fmtDate(val) {
    if (!val) return 'N/A';
    try { return new Date(val).toLocaleDateString('en-IN'); } catch (_) { return String(val); }
}

module.exports = { generateReportPDF };