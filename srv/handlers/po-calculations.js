// srv/handlers/po-calculations.js
'use strict';

module.exports = (srv) => {
  const { PurchaseOrders, POItems } = srv.entities;

  // Auto-recalculate PO totalAmount when items change
  srv.after(['CREATE', 'UPDATE'], POItems, async (result, req) => {
    const item = Array.isArray(result) ? result[0] : result;
    if (!item?.po_ID) return;

    const items = await SELECT.from(POItems)
      .columns('netAmount')
      .where({ po_ID: item.po_ID });

    const total = items.reduce((sum, i) => sum + (i.netAmount || 0), 0);

    await UPDATE(PurchaseOrders)
      .set({ totalAmount: total })
      .where({ ID: item.po_ID });

    console.log(`Auto-updated PO ${item.po_ID} totalAmount: ${total}`);
  });

  // CloseOldItems action handler
  srv.on('CloseOldItems', async (req) => {
    const { daysOld } = req.data;

    if (daysOld === undefined || daysOld < 0)
        return req.error(400, 'daysOld must be a non-negative integer');

    const cutoffDate = new Date(Date.now() - daysOld * 86400000).toISOString();

    // Step 1: find old PO IDs first
    const oldPOs = await SELECT.from(PurchaseOrders)
        .columns('ID')
        .where(`createdAt < '${cutoffDate}'`);

    if (!oldPOs.length)
        return { closed: 0, message: `No POs older than ${daysOld} days found` };

    const oldPOIds = oldPOs.map(po => po.ID);

    // Step 2: close open items belonging to those POs
    const itemsToClose = await SELECT.from(POItems)
        .where({ status: 'Open', po_ID: { in: oldPOIds } });

    let closedCount = 0;
    for (const item of itemsToClose) {
        await UPDATE(POItems).set({ status: 'Closed' }).where({ ID: item.ID });
        closedCount++;
    }

    return {
        closed  : closedCount,
        message : `Closed ${closedCount} open item(s) from POs older than ${daysOld} days`
    };
    });

    srv.on('RecalculateAllTotals', async (req) => {
        const allPOs = await SELECT.from(PurchaseOrders).columns('ID');
        let updated = 0;

        for (const po of allPOs) {
            const items = await SELECT.from(POItems)
            .columns('netAmount')
            .where({ po_ID: po.ID });

            const total = items.reduce((sum, i) => sum + (i.netAmount || 0), 0);

            await UPDATE(PurchaseOrders)
            .set({ totalAmount: total })
            .where({ ID: po.ID });

            updated++;
        }

        return `Recalculated totals for ${updated} purchase orders`;
    });

};