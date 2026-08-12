export interface VehicleBrand {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface VehicleModel {
  readonly id: string;
  readonly brandId: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface VehicleModelWithBrand extends VehicleModel {
  readonly brandName: string;
}

/**
 * Catalogo de marcas y modelos. Son tablas de catalogo (sin `deleted_at`):
 * se desactivan con `is_active` en lugar de borrarse, porque siempre hay
 * vehiculos historicos apuntando a ellas.
 */
export interface VehicleCatalogRepository {
  findBrandById(id: string): Promise<VehicleBrand | null>;
  findBrandByName(name: string): Promise<VehicleBrand | null>;
  listBrands(onlyActive: boolean): Promise<VehicleBrand[]>;
  createBrand(name: string): Promise<VehicleBrand>;
  updateBrand(id: string, data: { name?: string; isActive?: boolean }): Promise<VehicleBrand | null>;

  findModelById(id: string): Promise<VehicleModel | null>;
  findModelByBrandAndName(brandId: string, name: string): Promise<VehicleModel | null>;
  listModels(filters: { brandId?: string; onlyActive: boolean }): Promise<VehicleModelWithBrand[]>;
  createModel(brandId: string, name: string): Promise<VehicleModel>;
  updateModel(id: string, data: { name?: string; isActive?: boolean }): Promise<VehicleModel | null>;
}
