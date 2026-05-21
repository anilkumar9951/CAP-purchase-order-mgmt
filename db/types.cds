namespace com.po;

// ─── Scalar Types ────────────────────────────────────────────────────────────
type Amount   : Decimal(12,2);
type Quantity : Integer;
type Name     : String(100);
type Code     : String(20);
type LongText : String(1000);
type EmailAddress : String(200);
type CountryCode  : String(3);

// ─── Enums ───────────────────────────────────────────────────────────────────
type POStatus : String(20) enum {
  New      = 'New';
  Approved = 'Approved';
  Rejected = 'Rejected';
  Sent     = 'Sent';
}

type ItemStatus : String(20) enum {
  Open    = 'Open';
  Partial = 'Partial';
  Closed  = 'Closed';
}

type ReceiptStatus : String(20) enum {
  Partial  = 'Partial';
  Complete = 'Complete';
}

type Priority : Integer enum{
  Low     = 1;
  Medium  = 2;
  High    = 3;
}

// ─── Reusable Aspects ────────────────────────────────────────────────────────
aspect Auditable {
  approvedBy    : String(100);
  approvedAt    : DateTime;
  rejectedBy    : String(100);
  rejectedAt    : DateTime; 
  rejectionNote : LongText;
}

aspect Addressable {
  street  : String(100);
  city    : String(50);
  country : String(3);
  pincode : String(10);
}

aspect Trackable {
  trackingNumber    : String(50);
  carrier           : String(100);
  estimatedDelivery : Date;
  actualDelivery    : Date;
}

aspect Contactable {
  contactName   : Name;
  contactEmail  : EmailAddress;
  contactPhone  : String(20);
}