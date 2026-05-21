
namespace com.po;

using { com.po.Product } from './schema';

extend Product with {
  hazardousGoodsCode : String(10);
  storageConditions  : String(200);
  minimumOrderQty    : Integer default 1;
}