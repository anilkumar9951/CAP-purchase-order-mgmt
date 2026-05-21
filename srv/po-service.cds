// srv/po-service.cds
using com.po as db from '../db/schema';

@requires: 'authenticated-user'
service POService {
  @odata.draft.enabled
  @cds.redirection.target
  @restrict: [{ grant: 'READ', to: 'POViewer' }]
  entity PurchaseOrders as projection on db.PurchaseOrders;
  
  @readonly
  entity Suppliers as projection on db.Supplier;
  entity Products as projection on db.Product;

  @restrict: [
    { grant: 'READ', to: ['POViewer', 'POManager', 'POAdmin'] },
    { grant: 'WRITE', to: ['POManager', 'POAdmin'] }
  ]
  entity POItems as projection on db.POItems;
  entity POSchedules as projection on db.POSchedules;
  entity GoodsReceipts as projection on db.GoodsReceipt;
  entity GoodsReceiptItems as projection on db.GoodsReceiptItem;
  entity Categories as projection on db.Category;
  entity ProductCategories as projection on db.ProductCategory;
  entity ApprovalLogs as projection on db.ApprovalLog;
  
  entity POSummary as projection on db.PurchaseOrders {
    ID, orderNumber, status, totalAmount,
    supplier.name as supplierName, createdAt
  };

  @readonly
  entity PODashboard as projection on db.PurchaseOrders {
    ID, orderNumber, status, totalAmount,
    supplier.name as supplierName,
    createdAt, createdBy, approvedAt, approvedBy
  };

  // Actions with role restrictions
  @requires: 'POAdmin'
  action ApprovePO(approvedBy: String) returns PurchaseOrders;
  
  @requires: 'POAdmin'
  action RejectPO(rejectedBy: String, reason: String) returns PurchaseOrders;
  
  @requires: 'POAdmin'
  action RejectAndNotify(reason: String, notifyEmail: String) returns PurchaseOrders;
  
  action RecalculateAllTotals() returns String;

  @requires: ['POManager', 'POAdmin']
  action SendToSupplier() returns PurchaseOrders;

  action GetProductFromS4(materialNumber: String) returns {
    MaterialNumber: String(18);
    Description: String(200);
    BaseUnit: String(3);
    StandardPrice: Decimal(12,2);
    MaterialGroup: String(9);
  };
  
  function GetPOStatus(poID: UUID) returns String;

  // NEW: Secured analytics functions
  @requires: 'POViewer'  // Allow all authenticated users
  function GetPOSummaryStats() returns {
    totalPOs: Integer;
    newCount: Integer;
    approvedCount: Integer;
    rejectedCount: Integer;
  }

  action GetRelatedPOs(supplierID: UUID) returns array of PurchaseOrders;
  action ArchivePO(poID: UUID);

  @requires: 'POAdmin'  // Already restricted
  action BulkApprovePOs(
    poIDs: array of UUID,
    approvedBy: String,
    notes: String
  ) returns {
    approved: Integer;
    failed: Integer;
    errors: array of String;
  };
    
  action UpdatePOPriority(
    priority: Integer,
    notes: String
  ) returns PurchaseOrders;

  @requires: 'POAdmin'  // NEW: Restrict to Admin only
  action CloseOldItems(daysOld: Integer) returns {
    closed: Integer;
    message: String;
  };

  function GetPOsByPriority(priority: Integer) returns array of PurchaseOrders;

  @requires: ['POManager', 'POAdmin']  // NEW: Restrict to Manager and Admin
  function GetOverduePOs() returns array of PurchaseOrders;

  @requires: 'POAdmin'  // NEW: Restrict to Admin only
  function GetPOValueAnalysis() returns {
    totalValue: Decimal(16,2);
    averageValue: Decimal(16,2);
    highestValue: Decimal(16,2);
    lowestValue: Decimal(16,2);
    pendingValue: Decimal(16,2);
    approvedValue: Decimal(16,2);
  };

  function GetSupplierRating(supplierID: String) returns {
    supplierID: String;
    rating: Decimal(3,2);
    totalOrders: Integer;
    onTimeDelivery: Decimal(5,2);
    qualityScore: Decimal(3,2);
    communicationScore: Decimal(3,2);
    lastUpdated: DateTime;
  };

  action CreatePOWithGoodsReceiptPlan(
    orderNumber: String,
    supplier_ID: UUID,
    items: array of {
      product_ID: UUID;
      quantity: Integer;
      unitPrice: Decimal(12,2);
    },
    expectedDelivery: Date
  ) returns PurchaseOrders;
}