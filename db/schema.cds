//db/schema.cds
namespace com.po;

using { cuid, managed }                     from '@sap/cds/common';
using { com.po.Amount,   com.po.Quantity, com.po.EmailAddress,
        com.po.Name,     com.po.Code,
        com.po.POStatus, com.po.ItemStatus,
        com.po.ReceiptStatus, com.po.Priority,
        com.po.Auditable, com.po.Addressable,
        com.po.Trackable, com.po.Contactable }    from './types';

entity Supplier : cuid, Addressable, Contactable {
  @Search.defaultSearchElement
  name   : Name not null;
  @Search.defaultSearchElement
  email  : EmailAddress;
  code   : Code;
  orders : Association to many PurchaseOrders
             on orders.supplier = $self;
}


entity PurchaseOrders : cuid, managed, Auditable {
  @mandatory
  @Search.defaultSearchElement
  orderNumber   : Code not null;
  status        : POStatus default 'New';
  priority      : Priority default 2;
  @assert.range : [0, 99999999]
  totalAmount   : Amount;
  @UI.Hidden
  internalRef   : String(20);
  virtual statusLabel : String(30);
  supplier      : Association to Supplier;
  sentAt        : DateTime;
  items         : Composition of many POItems
                    on items.po = $self;
  goodsReceipts : Composition of many GoodsReceipt
                    on goodsReceipts.purchaseOrder = $self;
  
}

entity POItems : cuid {
  po        : Association to PurchaseOrders;
  @mandatory
  product   : Association to Product;
  @assert.range: [1, 99999]
  quantity  : Quantity not null;
  @assert.range: [0, 999999]
  unitPrice : Amount;
  netAmount : Amount = quantity * unitPrice;
  status    : ItemStatus default 'Open';
  schedules : Composition of many POSchedules
                on schedules.item = $self;
}

entity POSchedules : cuid, Trackable {
  item         : Association to POItems;
  deliveryDate : Date;
  quantity     : Quantity;
  status       : ItemStatus default 'Open';
}

entity GoodsReceipt : cuid, managed, Trackable {
  purchaseOrder : Association to PurchaseOrders;
  receivedDate  : Date;
  receivedBy    : String(100);
  status        : ReceiptStatus default 'Partial';
  items         : Composition of many GoodsReceiptItem
                    on items.goodsReceipt = $self;
}

entity GoodsReceiptItem : cuid {
  goodsReceipt : Association to GoodsReceipt;
  poItem       : Association to POItems;
  receivedQty  : Quantity;
}

entity ApprovalLog : cuid, managed {
  poID      : UUID;
  action    : String(20);  // 'Approved' or 'Rejected'
  performedBy : String(100);
  notes     : String(500);
  timestamp : DateTime;
}

entity Category : cuid {
  @Search.defaultSearchElement
  name          : Name not null;
  description   : String(200);
  
  // self-referential — a category can have a parent category
  parent        : Association to Category;
  children      : Association to many Category on children.parent = $self;
  products      : Association to many ProductCategory on products.category = $self;

}

entity ProductCategory  : cuid {
  //link entity - holds both sides
  product : Association to Product;
  category : Association to Category;
}

// extend Product entity — add this line inside Product
entity Product : cuid {
    @Search.defaultSearchElement
    name        : Name not null;
    description : String(500);
    price       : Amount;
    @Search.defaultSearchElement
    code        : Code;
    unit        : String(10);
    categories  : Association to many ProductCategory on categories.product = $self;

}




