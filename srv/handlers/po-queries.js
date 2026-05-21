// srv/handlers/po-queries.js
'use strict';

module.exports = (srv, S4, ProductMaster, SupplierSvc, SupplierRating) => {
  const { PurchaseOrders } = srv.entities;

  srv.on('GetPOStatus', async (req) => {
    const { poID } = req.data;
    const po = await SELECT.one('status').from(PurchaseOrders).where({ ID: poID });
    if (!po) return req.error(404, 'PO not found');
    return po.status;
  });

  srv.on('GetPOSummaryStats', async (req) => {
    const result = await SELECT.from(PurchaseOrders)
      .columns('status', 'count(*) as count')
      .groupBy('status');

    let totalPOs = 0, newCount = 0, approvedCount = 0, rejectedCount = 0;

    for (const row of result) {
      totalPOs += parseInt(row.count);
      switch (row.status) {
        case 'New':      newCount      = parseInt(row.count); break;
        case 'Approved': approvedCount = parseInt(row.count); break;
        case 'Rejected': rejectedCount = parseInt(row.count); break;
      }
    }
    return { totalPOs, newCount, approvedCount, rejectedCount };
  });

  srv.on('GetRelatedPOs', async (req) => {
    const { supplierID } = req.data;
    const pos = await SELECT.from(PurchaseOrders)
      .where({ supplier_ID: supplierID })
      .orderBy('createdAt desc')
      .limit(10);
    if (!pos.length)
      return req.error(404, `No POs found for supplier ${supplierID}`);
    return pos;
  });

  srv.on('GetProductFromS4', async (req) => {
    const { materialNumber } = req.data;
    try {
      const product = await S4.run(
        SELECT.one.from(ProductMaster).where({ MaterialNumber: materialNumber })
      );
      if (!product)
        return req.error(404, `Material ${materialNumber} not found in S/4`);
      return product;
    } catch (err) {
      console.warn('S4 lookup failed:', err.message);
      return req.error(500, 'S/4 service unavailable');
    }
  });

  /*srv.on('RecalculateAllTotals', async (req) => {
    const count = await SELECT`count(*) as cnt`.from(PurchaseOrders);
    return `Recalculated totals for ${count[0].cnt} purchase orders`;
  });*/

  srv.on('GetPOsByPriority', async (req) => {
    const { priority } = req.data;

    if (![1, 2, 3].includes(priority))
        return req.error(400, 'priority must be 1 (Low), 2 (Medium), or 3 (High)');

    const pos = await SELECT.from(PurchaseOrders)
        .where({ priority })
        .orderBy('createdAt desc');

    // Return empty array if none found — not a 404
    return pos;
  });

  srv.on('GetOverduePOs', async (req) => {
    // Calculate cutoff date (7 days ago from today)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    
    // Query Approved POs created more than 7 days ago
    const overduePOs = await SELECT
      .from(PurchaseOrders)
      .where({ 
        status: 'Approved',
        createdAt: { '<': cutoffDate.toISOString() }
      })
      .orderBy({ createdAt: 'asc' });
    
    // Add virtual ageInDays field to each result
    const now = new Date();
    for (const po of overduePOs) {
      const createdDate = new Date(po.createdAt);
      const ageInMs = now - createdDate;
      const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));
      po.ageInDays = ageInDays;
    }
    
    return overduePOs;
  });
  srv.on('GetPOValueAnalysis', async (req) => {
    const pos = await SELECT.from(PurchaseOrders)
      .columns('totalAmount', 'status')
      .where('totalAmount is not null');

    if (!pos.length)
      return {
        totalValue: 0, averageValue: 0,
        highestValue: 0, lowestValue: 0,
        pendingValue: 0, approvedValue: 0
      };

    const amounts   = pos.map(p => p.totalAmount || 0);
    const totalValue    = amounts.reduce((s, a) => s + a, 0);
    const averageValue  = totalValue / amounts.length;
    const highestValue  = Math.max(...amounts);
    const lowestValue   = Math.min(...amounts.filter(a => a > 0));
    const pendingValue  = pos.filter(p => p.status === 'New')
      .reduce((s, p) => s + (p.totalAmount || 0), 0);
    const approvedValue = pos.filter(p => p.status === 'Approved')
      .reduce((s, p) => s + (p.totalAmount || 0), 0);

    return {
      totalValue    : Math.round(totalValue * 100) / 100,
      averageValue  : Math.round(averageValue * 100) / 100,
      highestValue,
      lowestValue   : lowestValue || 0,
      pendingValue  : Math.round(pendingValue * 100) / 100,
      approvedValue : Math.round(approvedValue * 100) / 100
    };
  });
  srv.on('GetSupplierRating', async (req) => {
    const { supplierID } = req.data;
        
    // Validate supplierID parameter
    if (!supplierID) {
      return req.error({
        code: 'MISSING_SUPPLIER_ID',
        message: 'supplierID parameter is required',
        status: 400
      });
    }
    
    try {
      // Call SupplierValidationService to get the rating
      const supplierRating = await 
      SupplierSvc.run(
        SELECT.one.from(SupplierRating).where({ SupplierID: supplierID })
      );
      
      // If supplier not found in validation service
      if (!supplierRating) {
        return req.error({
          code: 'SUPPLIER_NOT_RATED',
          message: `Supplier ${supplierID} has not been rated yet`,
          status: 404
        });
      }
      
      // Return the full SupplierRating object
      return {
        SupplierID    : supplierRating.SupplierID,
        RatingScore   : supplierRating.RatingScore,
        RatingGrade   : supplierRating.RatingGrade,
        CreditLimit   : supplierRating.CreditLimit,
        IsBlacklisted : supplierRating.IsBlacklisted,
        LastUpdated   : supplierRating.LastUpdated
      }
      
    } catch (err) {
      // Check if validation service is down
      if (err.code === 'ECONNREFUSED' || 
          err.message?.includes('connect') || 
          err.message?.includes('timeout') ||
          err.message?.includes('ECONNRESET')) {
        return req.error({
          code: 'VALIDATION_SERVICE_UNAVAILABLE',
          message: 'Supplier validation service is currently unavailable. Please try again later.',
          status: 503
        });
      }
      
      // Log unexpected errors
      console.error('GetSupplierRating error:', err);
      return req.error({
        code: 'INTERNAL_ERROR',
        message: `Failed to retrieve supplier rating: ${err.message}`,
        status: 500
      });
    }
  });
  

};