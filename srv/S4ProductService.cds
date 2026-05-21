//srv/S4ProductService.cds

service S4ProductService {
  entity ProductMaster {
    key MaterialNumber : String(18);
    Description        : String(200);
    BaseUnit           : String(3);
    StandardPrice      : Decimal(12,2);
    MaterialGroup      : String(9);
    WeightUnit         : String(3);
    GrossWeight        : Decimal(13,3);
  }
}