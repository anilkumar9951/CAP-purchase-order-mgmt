// srv/external/SupplierValidationService.cds
service SupplierValidationService {
  entity SupplierRating {
    key SupplierID  : String(10);
    RatingScore     : Decimal(3,1);
    RatingGrade     : String(1);    // A, B, C, D
    CreditLimit     : Decimal(15,2);
    IsBlacklisted   : Boolean;
    LastUpdated     : Date;
  }
}