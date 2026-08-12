import type { NextFunction, Request, Response } from 'express';
import type { UseCaseOf } from '../../../application/shared/use-case';
import type { AddVehicleImageUseCase } from '../../../application/vehicles/add-vehicle-image.use-case';
import type { ChangeVehicleStatusUseCase } from '../../../application/vehicles/change-vehicle-status.use-case';
import type { CreateVehicleUseCase } from '../../../application/vehicles/create-vehicle.use-case';
import type { DeleteVehicleImageUseCase } from '../../../application/vehicles/delete-vehicle-image.use-case';
import type { DeleteVehicleUseCase } from '../../../application/vehicles/delete-vehicle.use-case';
import type { GetInventorySummaryUseCase } from '../../../application/vehicles/get-inventory-summary.use-case';
import type { GetVehicleUseCase } from '../../../application/vehicles/get-vehicle.use-case';
import type { ListVehicleImagesUseCase } from '../../../application/vehicles/list-vehicle-images.use-case';
import type { ListVehiclesUseCase } from '../../../application/vehicles/list-vehicles.use-case';
import type {
  CreateVehicleBrandUseCase,
  CreateVehicleModelUseCase,
  ListVehicleBrandsUseCase,
  ListVehicleModelsUseCase,
  UpdateVehicleBrandUseCase,
  UpdateVehicleModelUseCase,
} from '../../../application/vehicles/manage-vehicle-catalog.use-case';
import type { SetPrimaryVehicleImageUseCase } from '../../../application/vehicles/set-primary-vehicle-image.use-case';
import type { UpdateVehicleUseCase } from '../../../application/vehicles/update-vehicle.use-case';
import { compact, toPageQuery } from '../shared/common.schemas';
import { sendPaginated, sendResult } from '../shared/http-response';
import type {
  AddVehicleImageBody,
  CatalogQuery,
  ChangeVehicleStatusBody,
  CreateBrandBody,
  CreateModelBody,
  CreateVehicleBody,
  ListVehiclesQuery,
  UpdateBrandBody,
  UpdateModelBody,
  UpdateVehicleBody,
} from './vehicles.schemas';

export interface VehiclesControllerDeps {
  readonly createVehicle: UseCaseOf<CreateVehicleUseCase>;
  readonly updateVehicle: UseCaseOf<UpdateVehicleUseCase>;
  readonly getVehicle: UseCaseOf<GetVehicleUseCase>;
  readonly listVehicles: UseCaseOf<ListVehiclesUseCase>;
  readonly deleteVehicle: UseCaseOf<DeleteVehicleUseCase>;
  readonly changeVehicleStatus: UseCaseOf<ChangeVehicleStatusUseCase>;
  readonly getInventorySummary: UseCaseOf<GetInventorySummaryUseCase>;
  readonly addVehicleImage: UseCaseOf<AddVehicleImageUseCase>;
  readonly listVehicleImages: UseCaseOf<ListVehicleImagesUseCase>;
  readonly deleteVehicleImage: UseCaseOf<DeleteVehicleImageUseCase>;
  readonly setPrimaryVehicleImage: UseCaseOf<SetPrimaryVehicleImageUseCase>;
  readonly listBrands: UseCaseOf<ListVehicleBrandsUseCase>;
  readonly createBrand: UseCaseOf<CreateVehicleBrandUseCase>;
  readonly updateBrand: UseCaseOf<UpdateVehicleBrandUseCase>;
  readonly listModels: UseCaseOf<ListVehicleModelsUseCase>;
  readonly createModel: UseCaseOf<CreateVehicleModelUseCase>;
  readonly updateModel: UseCaseOf<UpdateVehicleModelUseCase>;
}

export class VehiclesController {
  constructor(private readonly deps: VehiclesControllerDeps) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as CreateVehicleBody;
    const result = await this.deps.createVehicle.execute(body);
    sendResult(res, next, result, 201);
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as UpdateVehicleBody;
    const result = await this.deps.updateVehicle.execute(
      compact({ vehicleId: req.params.id as string, ...body }),
    );
    sendResult(res, next, result);
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.getVehicle.execute({ vehicleId: req.params.id as string });
    sendResult(res, next, result);
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as ListVehiclesQuery;
    const result = await this.deps.listVehicles.execute({
      filters: compact({
        search: query.search,
        status: query.status,
        brandId: query.brandId,
        modelId: query.modelId,
        yearFrom: query.yearFrom,
        yearTo: query.yearTo,
        priceFrom: query.priceFrom,
        priceTo: query.priceTo,
        isActive: query.isActive,
      }),
      page: toPageQuery(query),
    });
    sendPaginated(res, next, result);
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.deleteVehicle.execute({ vehicleId: req.params.id as string });
    sendResult(res, next, result, 204);
  };

  changeStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as ChangeVehicleStatusBody;
    const result = await this.deps.changeVehicleStatus.execute({
      vehicleId: req.params.id as string,
      status: body.status,
    });
    sendResult(res, next, result);
  };

  inventorySummary = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.getInventorySummary.execute(undefined);
    sendResult(res, next, result);
  };

  // --- Imagenes ------------------------------------------------------------

  listImages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.listVehicleImages.execute({
      vehicleId: req.params.id as string,
    });
    sendResult(res, next, result);
  };

  addImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as AddVehicleImageBody;
    const result = await this.deps.addVehicleImage.execute({
      vehicleId: req.params.id as string,
      url: body.url,
      isPrimary: body.isPrimary,
    });
    sendResult(res, next, result, 201);
  };

  setPrimaryImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.setPrimaryVehicleImage.execute({
      vehicleId: req.params.id as string,
      imageId: req.params.imageId as string,
    });
    sendResult(res, next, result);
  };

  removeImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.deleteVehicleImage.execute({
      vehicleId: req.params.id as string,
      imageId: req.params.imageId as string,
    });
    sendResult(res, next, result, 204);
  };

  // --- Catalogo de marcas y modelos ---------------------------------------

  brands = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as CatalogQuery;
    const result = await this.deps.listBrands.execute({ onlyActive: query.includeInactive !== true });
    sendResult(res, next, result);
  };

  createBrandHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as CreateBrandBody;
    const result = await this.deps.createBrand.execute(body);
    sendResult(res, next, result, 201);
  };

  updateBrandHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as UpdateBrandBody;
    const result = await this.deps.updateBrand.execute(
      compact({ brandId: req.params.id as string, ...body }),
    );
    sendResult(res, next, result);
  };

  models = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as CatalogQuery;
    const result = await this.deps.listModels.execute(
      compact({ brandId: query.brandId, onlyActive: query.includeInactive !== true }),
    );
    sendResult(res, next, result);
  };

  createModelHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as CreateModelBody;
    const result = await this.deps.createModel.execute(body);
    sendResult(res, next, result, 201);
  };

  updateModelHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as UpdateModelBody;
    const result = await this.deps.updateModel.execute(
      compact({ modelId: req.params.id as string, ...body }),
    );
    sendResult(res, next, result);
  };
}
