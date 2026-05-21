//srv/handlers/po-actions.js

'use strict';

module.exports = (srv) => {
  const { PurchaseOrders, ApprovalLog } = srv.entities;

  srv.on('ApprovePO', PurchaseOrders, async (req) => {
    const { ID } = req.params[0];
    const approvedBy = req.data.approvedBy || req.user?.id || 'system';

    const po = await SELECT.one.from(PurchaseOrders).where({ ID });
    if (!po) {
      return req.error({
        code: 'PO_NOT_FOUND',
        message: `Purchase Order ${ID} not found`,
        target: 'ID',
        status: 404
      });
    }

    if (po.status !== 'New')
    return req.error({ 
        code: 'PO_INVALID_STATUS_FOR_APPROVAL',
        message: `PO ${po.orderNumber} cannot be approved`,
        status: 400, 
        details: [`Current: ${po.status}`] 
    });
    

    try {
      await UPDATE(PurchaseOrders)
        .set({ status: 'Approved', approvedBy, approvedAt: new Date().toISOString() })
        .where({ ID });

      await INSERT.into(ApprovalLog).entries({
        poID        : ID,
        action      : 'Approved',
        performedBy : approvedBy,
        notes       : `PO ${po.orderNumber} approved`,
        timestamp   : new Date().toISOString()
      });
    } catch (err) {
      return req.error({
        code: 'APPROVAL_FAILED',
        message: `Approval failed: ${err.message}`,
        status: 500
      });
    }

    return SELECT.one.from(PurchaseOrders).where({ ID });
  });

  srv.on('RejectPO', PurchaseOrders, async (req) => {
    const { ID } = req.params[0];
    const { rejectedBy, reason } = req.data;

    const po = await SELECT.one.from(PurchaseOrders).where({ ID });
    if (!po) {
      return req.error({
        code: 'PO_NOT_FOUND',
        message: `Purchase Order ${ID} not found`,
        target: 'ID',
        status: 404
      });
    }
    if (po.status !== 'New')
      return req.error({
        code    : 'PO_INVALID_STATUS_FOR_REJECTION',
        message : `PO ${po.orderNumber} cannot be rejected`,
        target  : 'status',
        status  : 400,
        details : [`Current status: ${po.status}`,
                  `Only New POs can be rejected`,
                  `Use ApprovePO for approval`]
      });

    await UPDATE(PurchaseOrders)
      .set({ status: 'Rejected', rejectedBy, rejectionNote: reason,
             rejectedAt: new Date().toISOString() })
      .where({ ID });

    return SELECT.one.from(PurchaseOrders).where({ ID });
  });
  srv.on('RejectAndNotify', PurchaseOrders, async (req) => {
    const { ID } = req.params[0];
    const { reason, notifyEmail } = req.data;
    
    // Get PO data first (outside transaction for validation)
    const po = await SELECT.one().from(PurchaseOrders).where({ ID });
    
    // Validate PO exists
    if (!po) {
      return req.error({
        code: 'PO_NOT_FOUND',
        message: `Purchase Order ${ID} not found`,
        target: 'ID',
        status: 404
      });
    }
    
    // Validate status - only New POs can be rejected
    if (po.status !== 'New') {
      return req.error({
        code: 'PO_INVALID_STATUS_FOR_REJECTION',
        message: `PO ${po.orderNumber} cannot be rejected`,
        target: 'status',
        status: 400,
        details: [`Current status: ${po.status}`,
                  `Only New POs can be rejected`,
                  `Use ApprovePO for approval`]
      });
    }
    
    // Validate email
    if (!notifyEmail || !notifyEmail.includes('@')) {
      return req.error({
        code: 'INVALID_EMAIL',
        message: 'Valid email address is required for notification',
        target: 'notifyEmail',
        status: 400
      });
    }
    
    // Explicit transaction - all DB operations must succeed together
    const tx = cds.transaction(req);
    
    try {
      // Step 1: UPDATE PO status to Rejected
      await tx.run(
        UPDATE(PurchaseOrders)
          .set({ 
            status: 'Rejected',
            rejectedBy: req.user?.id || 'system',
            rejectionNote: reason,
            rejectedAt: new Date().toISOString()
          })
          .where({ ID })
      );
      
      // Step 2: INSERT into ApprovalLog with action = 'Rejected'
      await tx.run(
        INSERT.into(ApprovalLog).entries({
          poID: ID,
          action: 'Rejected',
          performedBy: req.user?.id || 'system',
          notes: reason,
          timestamp: new Date().toISOString()
        })
      );
      
      // Step 3: Commit the transaction
      await tx.commit();
      
      // Step 4: Log notification message (after commit - don't rollback if this fails)
      console.log(`Notifying ${notifyEmail}: PO ${po.orderNumber} rejected — ${reason}`);
      
      // Return the updated PurchaseOrder
      return SELECT.one().from(PurchaseOrders).where({ ID });
      
    } catch (err) {
      // Rollback everything if any DB step fails
      await tx.rollback();
      console.error(`RejectAndNotify failed for PO ${ID}:`, err.message);
      
      return req.error({
        code: 'REJECTION_FAILED',
        message: `Failed to reject PO: ${err.message}`,
        status: 500
      });
    }
  });


  srv.on('SendToSupplier', PurchaseOrders, async (req) => {
    const { ID } = req.params[0];

    const po = await SELECT.one.from(PurchaseOrders).where({ ID });
    if (!po) return req.error(404, `PO ${ID} not found`);
    if (po.status !== 'Approved')
      return req.error(400, `Only Approved POs can be sent. Current: ${po.status}`);
    if (po.sentAt)
      return req.error({
        code    : 'PO_ALREADY_SENT',
        message : `${po.orderNumber} was already sent`,
        target  : 'status',
        status  : 409,
        details : [`Sent at: ${po.sentAt}`]
      });

    await UPDATE(PurchaseOrders)
      .set({ status: 'Sent', sentAt: new Date().toISOString() })
      .where({ ID });

    return SELECT.one.from(PurchaseOrders).where({ ID });
  });

  srv.on('CreatePOWithGoodsReceiptPlan', async (req) => {
    const { orderNumber, supplier_ID, items, expectedDelivery } = req.data;
    const { GoodsReceipt } = srv.entities;

    if (!orderNumber || !supplier_ID)
      return req.error(400, 'orderNumber and supplier_ID are required');

    if (!items?.length)
      return req.error(400, 'At least one item is required');

    // Step 1: Create the PO with items
    // Both are in the same implicit transaction
    const poData = {
      orderNumber,
      status      : 'New',
      supplier_ID,
      items       : items.map(i => ({
        product_ID : i.product_ID,
        quantity   : i.quantity,
        unitPrice  : i.unitPrice
      }))
    };

  await INSERT.into(PurchaseOrders).entries(poData);

      // Get the created PO
      const po = await SELECT.one.from(PurchaseOrders)
        .where({ orderNumber });

      if (!po) return req.error(500, 'PO creation failed');

      // Step 2: Create a planned goods receipt
      await INSERT.into(GoodsReceipt).entries({
        purchaseOrder_ID : po.ID,
        receivedDate     : expectedDelivery,
        receivedBy       : 'SYSTEM',
        status           : 'Partial'
      });

      // Both PO and GoodsReceipt created atomically
      // If GoodsReceipt fails → PO is also rolled back
      return SELECT.one.from(PurchaseOrders).where({ ID: po.ID });
    });

    srv.on('BulkApprovePOs', async (req) => {
      const { poIDs, approvedBy } = req.data;

      if (!poIDs?.length) return req.error(400, 'At least one PO ID required');
      if (!approvedBy)    return req.error(400, 'approvedBy is required');

      let approved = 0, failed = 0;
      const errors = [];

      for (const poID of poIDs) {
        // Separate transaction per PO
        // One PO failure does not roll back others
        const tx = cds.transaction(req);
        try {
          const po = await tx.run(
            SELECT.one.from(PurchaseOrders).where({ ID: poID })
          );

          if (!po) {
            errors.push(`PO ${poID} not found`);
            failed++;
            await tx.rollback();
            continue;
          }

          if (po.status !== 'New') {
            errors.push(`${po.orderNumber} cannot be approved — status: ${po.status}`);
            failed++;
            await tx.rollback();
            continue;
          }

          await tx.run(
            UPDATE(PurchaseOrders)
              .set({ status: 'Approved', approvedBy,
                    approvedAt: new Date().toISOString() })
              .where({ ID: poID })
          );

          await tx.run(
            INSERT.into(ApprovalLog).entries({
              poID, action: 'Approved', performedBy: approvedBy,
              notes: `Bulk approved`, timestamp: new Date().toISOString()
            })
          );

          await tx.commit();
          approved++;

        } catch (err) {
          await tx.rollback();
          errors.push(`PO ${poID} failed: ${err.message}`);
          failed++;
        }
      }

      return { approved, failed, errors };
    });

};