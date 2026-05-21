// srv/handlers/po-validations.js

'use strict';

const VALID_TRANSITIONS = {
  'New'      : ['Approved', 'Rejected'],
  'Approved' : ['Sent'],
  'Rejected' : [],
  'Sent'     : []
};

function isValidTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

module.exports = (srv, SupplierSvc, SupplierRating) => {
  const { PurchaseOrders } = srv.entities;
   srv.before('CREATE', PurchaseOrders, async (req) => {
    const { supplier_ID, totalAmount, orderNumber } = req.data;
    
    if (!supplier_ID) return;

    try {
      // Fetch supplier rating from validation service
      const rating = await SupplierSvc.run(
        SELECT.one.from(SupplierRating)
          .where({ supplierID: supplier_ID })
      );

      // 1. Blacklist check
      if (rating?.IsBlacklisted) {
        req.reject(400, {
          code   : 'SUPPLIER_BLACKLISTED',
          message: `Supplier ${supplier_ID} is blacklisted and cannot receive new POs`,
          target : 'supplier_ID'
        });
        return; // Stop execution
      }

      // 2. Credit limit check (skip if totalAmount is null, 0, or not provided)
      if (rating?.CreditLimit && totalAmount && totalAmount > 0) {
        if (totalAmount > rating.CreditLimit) {
          // Get supplier name for better error message
          const supplier = await SELECT.one.from(srv.entities.Suppliers)
            .where({ ID: supplier_ID })
            .columns('name');
          
          const supplierName = supplier?.name || supplier_ID;
          
          req.reject(400, {
            code   : 'CREDIT_LIMIT_EXCEEDED',
            message: `Credit limit exceeded for supplier "${supplierName}". ` +
                     `Credit limit: ${rating.CreditLimit.toLocaleString()}, ` +
                     `Requested amount: ${totalAmount.toLocaleString()}`,
            target : 'totalAmount',
            status : 400
          });
          return; // Stop execution
        }
      }

      // Warn if low rating but allow
      if (rating && rating.RatingGrade === 'D') {
        console.warn(`Warning: Supplier ${supplier_ID} has a D rating`);
      }

    } catch (err) {
      // Graceful degradation — if validation service is down, allow creation
      console.warn('Supplier validation service unavailable:', err.message);
      // Do not reject - allow creation to proceed
    }
  });

  // Handler 1: data enrichment — auto-uppercase, set defaults
  srv.before('CREATE', PurchaseOrders, async (req) => {
    if (req.data.orderNumber)
      req.data.orderNumber = req.data.orderNumber.toUpperCase();
    if (!req.data.priority)
      req.data.priority = 2;
  });

  // Handler 2: field validation — collect all errors
  srv.before('CREATE', PurchaseOrders, async (req) => {
    if (!req.data.orderNumber)
      req.error({ code: 'MISSING_ORDER_NUMBER',
                  message: 'Order number is required',
                  target: 'orderNumber', status: 400 });

    if (!req.data.supplier_ID)
      req.error({ code: 'MISSING_SUPPLIER',
                  message: 'Supplier is required',
                  target: 'supplier_ID', status: 400 });

    if (req.data.totalAmount < 0)
      req.error({ code: 'INVALID_AMOUNT',
                  message: 'Total amount cannot be negative',
                  target: 'totalAmount', status: 400 });
  });

  // Handler 3: duplicate check — reject immediately
  srv.before('CREATE', PurchaseOrders, async (req) => {
    if (!req.data.orderNumber) return;
    const existing = await SELECT.one.from(PurchaseOrders)
      .where({ orderNumber: req.data.orderNumber });
    if (existing)
      req.reject(409, `Order number ${req.data.orderNumber} already exists`);
  });

  
  srv.before('UPDATE', PurchaseOrders, async (req) => {
    const newStatus = req.data.status;
    if (!newStatus) return; // no status change — skip

    const ID = req.params?.[0]?.ID || req.data?.ID;
    if (!ID) return;

    const currentPO = await SELECT.one('status')
      .from(PurchaseOrders).where({ ID });
    if (!currentPO) return;

    if (!isValidTransition(currentPO.status, newStatus)) {
      req.reject(400,
        `Invalid status transition: ${currentPO.status} → ${newStatus}. ` +
        `Allowed from ${currentPO.status}: ${VALID_TRANSITIONS[currentPO.status]?.join(', ') || 'none'}`
      );
    }
  });

};