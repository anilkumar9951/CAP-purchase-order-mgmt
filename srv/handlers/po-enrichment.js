// srv/handlers/po-enrichment.js
'use strict';

module.exports = (srv, S4, ProductMaster) => {
  const { PurchaseOrders, POItems } = srv.entities;

  

  // S4 enrichment: add product details to POItems
  srv.after('READ', POItems, async each => {
    const list = Array.isArray(each) ? each : [each];

    for (const item of list) {
      // Status label for items
      const statusLabels = { 'Open': 'Open', 'Partial': 'Partially Received', 'Closed': 'Closed' };
      item.statusLabel = statusLabels[item.status] || item.status;

      // S4 enrichment — product details
      if (item.product_ID) {
        try {
          const product = await S4.run(
            SELECT.one.from(ProductMaster).where({ MaterialNumber: item.product_ID })
          );
          if (product) {
            item.s4Description   = product.Description;
            item.s4StandardPrice = product.StandardPrice;
            item.s4MaterialGroup = product.MaterialGroup;

            // Compute price variance — how much over/under standard price
            if (product.StandardPrice && item.unitPrice) {
              item.priceVariance = item.unitPrice - product.StandardPrice;
              item.priceVariancePct = Math.round(
                ((item.unitPrice - product.StandardPrice) / product.StandardPrice) * 100
              );
            }
          }
        } catch (err) {
          console.warn(`S4 lookup failed for ${item.product_ID}:`, err.message);
        }
      }
    }
  });
  srv.after('READ', PurchaseOrders, each => {
    const labels = {
      'New': 'Pending Review', 'Approved': 'Approved',
      'Rejected': 'Rejected', 'Sent': 'Sent to Supplier'
    };
    each.statusLabel = labels[each.status] || each.status;

    // Age in days
    if (each.createdAt) {
      each.ageInDays = Math.floor(
        (new Date() - new Date(each.createdAt)) / 86400000
      );
    }

    // Overdue flag
    each.isOverdue = each.status === 'Approved' && (each.ageInDays || 0) > 7;

    // Priority label — transform integer to readable string
    const priorityLabels = { 1: 'Low', 2: 'Medium', 3: 'High' };
    each.priorityLabel = priorityLabels[each.priority] || 'Unknown';

    // Formatted amount — useful for display
    if (each.totalAmount !== null && each.totalAmount !== undefined) {
      each.formattedAmount = `INR ${Number(each.totalAmount).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`;
    }
  });
};