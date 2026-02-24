interface PrintMenuItem {
  itemName: string;
  category?: string;
}

interface PrintOrderItem {
  itemName: string;
  category: string;
  quantity: number;
}

function openPrintWindow(html: string) {
  const printWindow = window.open("", "_blank", "width=400,height=600");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}

const receiptStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; width: 80mm; max-width: 80mm; padding: 4mm; font-size: 12px; color: #000; }
  .header { text-align: center; margin-bottom: 6mm; border-bottom: 1px dashed #000; padding-bottom: 4mm; }
  .header h1 { font-size: 18px; font-weight: bold; letter-spacing: 1px; }
  .header h2 { font-size: 11px; font-weight: normal; margin-top: 2mm; }
  .category { margin-top: 4mm; }
  .category-title { font-size: 13px; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 1mm; margin-bottom: 2mm; }
  .item { padding: 1mm 0; font-size: 12px; }
  .order-item { display: flex; justify-content: space-between; padding: 1mm 0; font-size: 12px; }
  .order-item .qty { font-weight: bold; min-width: 30px; }
  .order-item .name { flex: 1; }
  .divider { border-top: 1px dashed #000; margin: 3mm 0; }
  .total-line { display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; margin-top: 2mm; }
  .footer { text-align: center; margin-top: 6mm; border-top: 1px dashed #000; padding-top: 4mm; font-size: 10px; }
  .timestamp { text-align: center; font-size: 10px; margin-top: 2mm; }
  @media print { body { width: 80mm; max-width: 80mm; } }
`;

export function printMenu(categories: { category: string; items: PrintMenuItem[] }[]) {
  const categoriesHtml = categories
    .map(
      (cat) => `
      <div class="category">
        <div class="category-title">${cat.category}</div>
        ${cat.items.map((item) => `<div class="item">${item.itemName}</div>`).join("")}
      </div>`
    )
    .join("");

  const totalItems = categories.reduce((s, c) => s + c.items.length, 0);

  const html = `<!DOCTYPE html><html><head><style>${receiptStyles}</style></head><body>
    <div class="header">
      <h1>PAOLA'S</h1>
      <h2>Cosa Nostra</h2>
    </div>
    <div style="text-align:center;font-size:14px;font-weight:bold;margin-bottom:4mm;">MENU</div>
    ${categoriesHtml}
    <div class="divider"></div>
    <div style="text-align:center;font-size:11px;">${totalItems} items</div>
    <div class="footer">Thank you for dining with us</div>
    <div class="timestamp">${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
  </body></html>`;

  openPrintWindow(html);
}

export function printOrder(
  tableName: string,
  guestName: string | undefined,
  items: PrintOrderItem[],
  orderTime?: string
) {
  const grouped = new Map<string, PrintOrderItem[]>();
  for (const item of items) {
    const list = grouped.get(item.category) || [];
    list.push(item);
    grouped.set(item.category, list);
  }

  const categoriesHtml = Array.from(grouped.entries())
    .map(
      ([category, catItems]) => `
      <div class="category">
        <div class="category-title">${category}</div>
        ${catItems
          .map(
            (item) => `
          <div class="order-item">
            <span class="qty">x${item.quantity}</span>
            <span class="name">${item.itemName}</span>
          </div>`
          )
          .join("")}
      </div>`
    )
    .join("");

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const timeStr = orderTime || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const html = `<!DOCTYPE html><html><head><style>${receiptStyles}</style></head><body>
    <div class="header">
      <h1>PAOLA'S</h1>
      <h2>Cosa Nostra</h2>
    </div>
    <div style="text-align:center;font-size:14px;font-weight:bold;margin-bottom:2mm;">ORDER</div>
    <div style="margin-bottom:4mm;">
      <div style="font-weight:bold;font-size:13px;">${tableName}</div>
      ${guestName ? `<div style="font-size:11px;">${guestName}</div>` : ""}
      <div style="font-size:10px;">${timeStr}</div>
    </div>
    <div class="divider"></div>
    ${categoriesHtml}
    <div class="divider"></div>
    <div class="total-line">
      <span>Total Items</span>
      <span>${totalItems}</span>
    </div>
    <div class="footer">Thank you for dining with us</div>
    <div class="timestamp">${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
  </body></html>`;

  openPrintWindow(html);
}
