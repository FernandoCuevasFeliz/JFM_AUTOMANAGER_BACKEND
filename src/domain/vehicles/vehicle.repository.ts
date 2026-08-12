import type { PageQuery, PaginatedResult } from '../shared/pagination';
import type {
  NewVehicle,
  Vehicle,
  VehicleImage,
  VehicleStatus,
  VehicleUpdate,
  VehicleWithDetails,
} from './vehicle.entity';

export interface VehicleFilters {
  /** Busqueda libre sobre chasis, marca, modelo y color. */
  readonly search?: string;
  readonly status?: VehicleStatus | VehicleStatus[];
  readonly brandId?: string;
  readonly modelId?: string;
  readonly yearFrom?: number;
  readonly yearTo?: number;
  readonly priceFrom?: number;
  readonly priceTo?: number;
  readonly isActive?: boolean;
}

/**
 * Puerto de persistencia de vehiculos.
 *
 * Contrato transversal: toda lectura filtra `deleted_at IS NULL`. Los casos de
 * uso nunca mencionan el borrado logico.
 */
export interface VehicleRepository {
  findById(id: string): Promise<Vehicle | null>;
  findByIdWithDetails(id: string): Promise<VehicleWithDetails | null>;
  findByChassisNumber(chassisNumber: string): Promise<Vehicle | null>;
  existsByChassisNumber(chassisNumber: string, excludeVehicleId?: string): Promise<boolean>;
  list(filters: VehicleFilters, page: PageQuery): Promise<PaginatedResult<VehicleWithDetails>>;
  create(data: NewVehicle): Promise<Vehicle>;
  update(id: string, data: VehicleUpdate): Promise<Vehicle | null>;
  /**
   * Cambia el estado sin pasar por `update` para dejar explicito en el codigo
   * que es una operacion distinta, sujeta a la maquina de estados.
   */
  updateStatus(id: string, status: VehicleStatus): Promise<Vehicle | null>;
  softDelete(id: string): Promise<boolean>;

  /** Conteo por estado para el tablero de inventario. */
  countByStatus(): Promise<Record<VehicleStatus, number>>;

  // --- Imagenes (parte del agregado Vehicle) -------------------------------
  listImages(vehicleId: string): Promise<VehicleImage[]>;
  findImageById(imageId: string): Promise<VehicleImage | null>;
  addImage(vehicleId: string, url: string, isPrimary: boolean): Promise<VehicleImage>;
  deleteImage(imageId: string): Promise<boolean>;
  /** Marca una imagen como principal y desmarca el resto del mismo vehiculo. */
  setPrimaryImage(vehicleId: string, imageId: string): Promise<VehicleImage | null>;
}
