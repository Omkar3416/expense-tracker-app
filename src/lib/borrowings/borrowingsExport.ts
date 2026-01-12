// src/lib/borrowings/borrowingsExport.ts

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Borrowing } from "@/store/features/borrowings/borrowingSlice";
import { todayISO, formatMoney } from "./borrowingsHelpers";

const moneyINR = (n: number) => `INR ${formatMoney(n)}`;

export function exportBorrowingsCSV(list: Borrowing[]) {
  const rows: string[][] = [
    [
      "Person",
      "Type",
      "Category",
      "Amount",
      "Paid",
      "Remaining",
      "Status",
      "Due Date",
      "Paid At",
      "Note",
      "Created At",
    ],
    ...list.map((b) => {
      const remaining = Math.max(0, b.amount - b.amountPaid);

      return [
        b.person,
        b.type,
        b.category,
        String(b.amount),
        String(b.amountPaid),
        String(remaining),
        b.status,
        b.dueDate,
        b.paidAt ?? "",
        b.note ?? "",
        b.createdAt,
      ];
    }),
  ];

  const csv = rows
    .map((r) =>
      r
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `borrowings_${todayISO()}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}

export function exportBorrowingsPDF(list: Borrowing[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFont("times", "normal");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const reportDate = new Date().toLocaleString();

  // background
  doc.setFillColor(11, 18, 32);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // header gradient
  const headerH = 90;
  for (let i = 0; i < headerH; i++) {
    const ratio = i / headerH;
    doc.setFillColor(
      Math.floor(88 + ratio * 90),
      Math.floor(50 + ratio * 90),
      Math.floor(220 - ratio * 60)
    );
    doc.rect(0, i, pageWidth, 1, "F");
  }

  doc.setFont("times", "bold");
  doc.setFontSize(26);
  doc.setTextColor(255, 255, 255);
  doc.text("Borrowings Report", 28, 50);

  doc.setFont("times", "normal");
  doc.setFontSize(12);
  doc.setTextColor(230, 230, 230);
  doc.text(`Generated: ${reportDate}`, 28, 75);

  const rows = list.map((b) => {
    const remaining = Math.max(0, b.amount - b.amountPaid);

    return [
      String(b.person ?? "-"),
      b.type === "borrowed" ? "Borrowed" : "Lent",
      String(b.category ?? "-"),
      moneyINR(b.amount),
      moneyINR(b.amountPaid),
      moneyINR(remaining),
      String(b.status ?? "").toUpperCase(),
      String(b.dueDate ?? "-"),
      b.paidAt ? new Date(b.paidAt).toLocaleDateString() : "-",
      b.note ? String(b.note) : "-",
    ];
  });

  autoTable(doc, {
    startY: 120,
    head: [
      [
        "Person",
        "Type",
        "Category",
        "Amount",
        "Paid",
        "Remaining",
        "Status",
        "Due",
        "Paid Date",
        "Note",
      ],
    ],
    body: rows,
    tableWidth: "auto",
    margin: { left: 20, right: 20 },
    theme: "grid",

    styles: {
      font: "times",
      fontSize: 9,
      cellPadding: 5,
      textColor: [235, 235, 235],
      fillColor: [17, 24, 39],
      lineColor: [55, 70, 95],
      lineWidth: 0.5,
      overflow: "linebreak",
      valign: "middle",
    },

    headStyles: {
      font: "times",
      fontStyle: "bold",
      fontSize: 10,
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      lineColor: [90, 110, 160],
      lineWidth: 0.7,
    },

    alternateRowStyles: { fillColor: [11, 18, 32] },

    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 65 },
      2: { cellWidth: 70 },
      3: { cellWidth: 80, halign: "right" },
      4: { cellWidth: 80, halign: "right" },
      5: { cellWidth: 90, halign: "right" },
      6: { cellWidth: 65 },
      7: { cellWidth: 80 },
      8: { cellWidth: 85 },
      9: { cellWidth: 210 },
    },

    didParseCell: (data) => {
      if (data.cell.section === "body" && data.column.index === 6) {
        const status = String(data.cell.raw ?? "").toUpperCase();
        if (status === "PAID") {
          data.cell.styles.fillColor = [16, 185, 129];
          data.cell.styles.textColor = [0, 0, 0];
          data.cell.styles.fontStyle = "bold";
        } else if (status === "PENDING") {
          data.cell.styles.fillColor = [245, 158, 11];
          data.cell.styles.textColor = [0, 0, 0];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },

    didDrawPage: () => {
      doc.setFont("times", "normal");
      doc.setFontSize(10);
      doc.setTextColor(180, 180, 180);
      const pageCount = doc.getNumberOfPages();
      doc.text("Expense Tracker • Borrowings Report", 20, pageHeight - 18);
      doc.text(`Page ${pageCount}`, pageWidth - 70, pageHeight - 18);
    },
  });

  doc.save(`borrowings_${todayISO()}.pdf`);
}
