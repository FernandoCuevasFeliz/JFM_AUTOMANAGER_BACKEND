import type { Pool } from 'pg';
import { CreateExpenseCategoryUseCase, ListCatalogsUseCase } from '../application/catalogs/list-catalogs.use-case';
import { CreateClientUseCase } from '../application/clients/create-client.use-case';
import { DeleteClientUseCase } from '../application/clients/delete-client.use-case';
import { GetClientUseCase } from '../application/clients/get-client.use-case';
import { ListClientsUseCase } from '../application/clients/list-clients.use-case';
import { UpdateClientUseCase } from '../application/clients/update-client.use-case';
import { CreateExpenseUseCase } from '../application/expenses/create-expense.use-case';
import { DeleteExpenseUseCase } from '../application/expenses/delete-expense.use-case';
import { GetExpenseUseCase } from '../application/expenses/get-expense.use-case';
import { GetVehicleCostSummaryUseCase } from '../application/expenses/get-vehicle-cost-summary.use-case';
import { ListExpensesUseCase } from '../application/expenses/list-expenses.use-case';
import { UpdateExpenseUseCase } from '../application/expenses/update-expense.use-case';
import { ChangePurchaseStatusUseCase } from '../application/purchases/change-purchase-status.use-case';
import { CreatePurchaseUseCase } from '../application/purchases/create-purchase.use-case';
import { DeletePurchaseUseCase } from '../application/purchases/delete-purchase.use-case';
import { GetPurchaseUseCase } from '../application/purchases/get-purchase.use-case';
import { ListPurchasesUseCase } from '../application/purchases/list-purchases.use-case';
import { UpdatePurchaseUseCase } from '../application/purchases/update-purchase.use-case';
import { ChangeQuotationStatusUseCase } from '../application/quotations/change-quotation-status.use-case';
import { CreateQuotationUseCase } from '../application/quotations/create-quotation.use-case';
import { DeleteQuotationUseCase } from '../application/quotations/delete-quotation.use-case';
import { ExpireQuotationsUseCase } from '../application/quotations/expire-quotations.use-case';
import { GetQuotationUseCase } from '../application/quotations/get-quotation.use-case';
import { ListQuotationsUseCase } from '../application/quotations/list-quotations.use-case';
import { UpdateQuotationUseCase } from '../application/quotations/update-quotation.use-case';
import { CancelReservationUseCase } from '../application/reservations/cancel-reservation.use-case';
import { CreateReservationUseCase } from '../application/reservations/create-reservation.use-case';
import { ExpireReservationsUseCase } from '../application/reservations/expire-reservations.use-case';
import { GetReservationUseCase } from '../application/reservations/get-reservation.use-case';
import { ListReservationsUseCase } from '../application/reservations/list-reservations.use-case';
import { UpdateReservationUseCase } from '../application/reservations/update-reservation.use-case';
import { CancelSaleUseCase } from '../application/sales/cancel-sale.use-case';
import { CompleteSaleUseCase } from '../application/sales/complete-sale.use-case';
import { CreateSaleUseCase } from '../application/sales/create-sale.use-case';
import { DeleteSaleUseCase } from '../application/sales/delete-sale.use-case';
import { GetSaleUseCase } from '../application/sales/get-sale.use-case';
import { ListSalePaymentsUseCase } from '../application/sales/list-sale-payments.use-case';
import { GetSalesSummaryUseCase, ListSalesUseCase } from '../application/sales/list-sales.use-case';
import { RegisterSalePaymentUseCase } from '../application/sales/register-sale-payment.use-case';
import { UpdateSaleUseCase } from '../application/sales/update-sale.use-case';
import type { AuditDependencies } from '../application/shared/with-audit';
import { withAudit } from '../application/shared/with-audit';
import { CreateSupplierUseCase } from '../application/suppliers/create-supplier.use-case';
import { DeleteSupplierUseCase } from '../application/suppliers/delete-supplier.use-case';
import { GetSupplierUseCase } from '../application/suppliers/get-supplier.use-case';
import { ListSuppliersUseCase } from '../application/suppliers/list-suppliers.use-case';
import { UpdateSupplierUseCase } from '../application/suppliers/update-supplier.use-case';
import { AuthenticateUserUseCase } from '../application/users/authenticate-user.use-case';
import { ChangePasswordUseCase } from '../application/users/change-password.use-case';
import { CreateUserUseCase } from '../application/users/create-user.use-case';
import { DeleteUserUseCase } from '../application/users/delete-user.use-case';
import { GetUserUseCase } from '../application/users/get-user.use-case';
import { ListRolesUseCase } from '../application/users/list-roles.use-case';
import { ListUsersUseCase } from '../application/users/list-users.use-case';
import { UpdateUserUseCase } from '../application/users/update-user.use-case';
import { AddVehicleImageUseCase } from '../application/vehicles/add-vehicle-image.use-case';
import { ChangeVehicleStatusUseCase } from '../application/vehicles/change-vehicle-status.use-case';
import { CreateVehicleUseCase } from '../application/vehicles/create-vehicle.use-case';
import { DeleteVehicleImageUseCase } from '../application/vehicles/delete-vehicle-image.use-case';
import { DeleteVehicleUseCase } from '../application/vehicles/delete-vehicle.use-case';
import { GetInventorySummaryUseCase } from '../application/vehicles/get-inventory-summary.use-case';
import { GetVehicleUseCase } from '../application/vehicles/get-vehicle.use-case';
import { ListVehicleImagesUseCase } from '../application/vehicles/list-vehicle-images.use-case';
import { ListVehiclesUseCase } from '../application/vehicles/list-vehicles.use-case';
import {
  CreateVehicleBrandUseCase,
  CreateVehicleModelUseCase,
  ListVehicleBrandsUseCase,
  ListVehicleModelsUseCase,
  UpdateVehicleBrandUseCase,
  UpdateVehicleModelUseCase,
} from '../application/vehicles/manage-vehicle-catalog.use-case';
import { SetPrimaryVehicleImageUseCase } from '../application/vehicles/set-primary-vehicle-image.use-case';
import { UpdateVehicleUseCase } from '../application/vehicles/update-vehicle.use-case';
import type { TokenService } from '../domain/users/token-service';
import { AsyncLocalAuditContext } from '../infrastructure/audit/async-local-audit-context';
import { KyselyAuditLogRepository } from '../infrastructure/audit/kysely-audit-log.repository';
import { BcryptPasswordHasher } from '../infrastructure/auth/bcrypt-password-hasher';
import { JwtTokenService } from '../infrastructure/auth/jwt-token-service';
import { env } from '../infrastructure/config/env';
import { createDatabase, createPool, type Database } from '../infrastructure/database/connection';
import { KyselyUnitOfWork } from '../infrastructure/database/kysely-unit-of-work';
import { logger } from '../infrastructure/logging/logger';
import { KyselyCatalogRepository } from '../infrastructure/repositories/kysely-catalog.repository';
import { KyselyClientRepository } from '../infrastructure/repositories/kysely-client.repository';
import { KyselyExpenseRepository } from '../infrastructure/repositories/kysely-expense.repository';
import { KyselyPurchaseRepository } from '../infrastructure/repositories/kysely-purchase.repository';
import { KyselyQuotationRepository } from '../infrastructure/repositories/kysely-quotation.repository';
import { KyselyReservationRepository } from '../infrastructure/repositories/kysely-reservation.repository';
import { KyselyRoleRepository } from '../infrastructure/repositories/kysely-role.repository';
import { KyselySaleRepository } from '../infrastructure/repositories/kysely-sale.repository';
import { KyselySupplierRepository } from '../infrastructure/repositories/kysely-supplier.repository';
import { KyselyUserRepository } from '../infrastructure/repositories/kysely-user.repository';
import { KyselyVehicleCatalogRepository } from '../infrastructure/repositories/kysely-vehicle-catalog.repository';
import { KyselyVehicleRepository } from '../infrastructure/repositories/kysely-vehicle.repository';
import { SystemClock } from '../infrastructure/system-clock';
import { CatalogsController } from '../presentation/http/catalogs/catalogs.controller';
import { ClientsController } from '../presentation/http/clients/clients.controller';
import { ExpensesController } from '../presentation/http/expenses/expenses.controller';
import { PurchasesController } from '../presentation/http/purchases/purchases.controller';
import { QuotationsController } from '../presentation/http/quotations/quotations.controller';
import { ReservationsController } from '../presentation/http/reservations/reservations.controller';
import { SalesController } from '../presentation/http/sales/sales.controller';
import { SuppliersController } from '../presentation/http/suppliers/suppliers.controller';
import { UsersController } from '../presentation/http/users/users.controller';
import { VehiclesController } from '../presentation/http/vehicles/vehicles.controller';

/**
 * Composition root: el UNICO lugar donde se instancian implementaciones
 * concretas y se conectan con los puertos.
 *
 * Es tambien donde se decide que operaciones quedan auditadas: cada llamada a
 * `withAudit` es una linea del registro de auditoria del sistema, legible de un
 * vistazo, en lugar de estar dispersa por los casos de uso.
 */
export interface Container {
  readonly db: Database;
  readonly pool: Pool;
  readonly tokens: TokenService;
  readonly auditContext: AsyncLocalAuditContext;
  readonly controllers: {
    readonly users: UsersController;
    readonly vehicles: VehiclesController;
    readonly clients: ClientsController;
    readonly suppliers: SuppliersController;
    readonly purchases: PurchasesController;
    readonly expenses: ExpensesController;
    readonly quotations: QuotationsController;
    readonly reservations: ReservationsController;
    readonly sales: SalesController;
    readonly catalogs: CatalogsController;
  };
  shutdown(): Promise<void>;
}

export function buildContainer(): Container {
  // --- Infraestructura ------------------------------------------------------
  const pool = createPool();
  const db = createDatabase(pool);
  const clock = new SystemClock();
  const unitOfWork = new KyselyUnitOfWork(db);

  const passwordHasher = new BcryptPasswordHasher(env.BCRYPT_SALT_ROUNDS);
  const tokens = new JwtTokenService({
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: env.JWT_ISSUER,
  });

  const auditContext = new AsyncLocalAuditContext();
  const auditRepository = new KyselyAuditLogRepository(db);
  const audit: AuditDependencies = {
    auditLogs: auditRepository,
    snapshots: auditRepository,
    context: auditContext,
    onFailure: (error) => {
      logger.error({ err: error }, 'No se pudo registrar la auditoria de la operacion');
    },
  };

  // --- Repositorios ---------------------------------------------------------
  const users = new KyselyUserRepository(db);
  const roles = new KyselyRoleRepository(db);
  const catalog = new KyselyCatalogRepository(db);
  const vehicles = new KyselyVehicleRepository(db);
  const vehicleCatalog = new KyselyVehicleCatalogRepository(db);
  const clients = new KyselyClientRepository(db);
  const suppliers = new KyselySupplierRepository(db);
  const purchases = new KyselyPurchaseRepository(db);
  const expenses = new KyselyExpenseRepository(db);
  const quotations = new KyselyQuotationRepository(db);
  const reservations = new KyselyReservationRepository(db);
  const sales = new KyselySaleRepository(db);

  // --- Controladores --------------------------------------------------------
  const usersController = new UsersController({
    authenticateUser: new AuthenticateUserUseCase(users, passwordHasher, tokens, clock),
    getUser: new GetUserUseCase(users),
    listUsers: new ListUsersUseCase(users),
    listRoles: new ListRolesUseCase(roles),
    createUser: withAudit(
      new CreateUserUseCase(users, roles, passwordHasher),
      { table: 'users', action: 'insert', recordIdFromOutput: (user) => user.id },
      audit,
    ),
    updateUser: withAudit(
      new UpdateUserUseCase(users, roles),
      { table: 'users', action: 'update', recordIdFromInput: (input) => input.userId },
      audit,
    ),
    deleteUser: withAudit(
      new DeleteUserUseCase(users),
      { table: 'users', action: 'delete', recordIdFromInput: (input) => input.userId },
      audit,
    ),
    changePassword: withAudit(
      new ChangePasswordUseCase(users, passwordHasher),
      { table: 'users', action: 'update', recordIdFromInput: (input) => input.userId },
      audit,
    ),
  });

  const vehiclesController = new VehiclesController({
    getVehicle: new GetVehicleUseCase(vehicles),
    listVehicles: new ListVehiclesUseCase(vehicles),
    getInventorySummary: new GetInventorySummaryUseCase(vehicles),
    listVehicleImages: new ListVehicleImagesUseCase(vehicles),
    listBrands: new ListVehicleBrandsUseCase(vehicleCatalog),
    listModels: new ListVehicleModelsUseCase(vehicleCatalog),
    createVehicle: withAudit(
      new CreateVehicleUseCase(vehicles, vehicleCatalog),
      { table: 'vehicles', action: 'insert', recordIdFromOutput: (vehicle) => vehicle.id },
      audit,
    ),
    updateVehicle: withAudit(
      new UpdateVehicleUseCase(vehicles, vehicleCatalog),
      { table: 'vehicles', action: 'update', recordIdFromInput: (input) => input.vehicleId },
      audit,
    ),
    changeVehicleStatus: withAudit(
      new ChangeVehicleStatusUseCase(vehicles),
      { table: 'vehicles', action: 'update', recordIdFromInput: (input) => input.vehicleId },
      audit,
    ),
    deleteVehicle: withAudit(
      new DeleteVehicleUseCase(vehicles),
      { table: 'vehicles', action: 'delete', recordIdFromInput: (input) => input.vehicleId },
      audit,
    ),
    addVehicleImage: withAudit(
      new AddVehicleImageUseCase(vehicles),
      { table: 'vehicle_images', action: 'insert', recordIdFromOutput: (image) => image.id },
      audit,
    ),
    setPrimaryVehicleImage: withAudit(
      new SetPrimaryVehicleImageUseCase(vehicles),
      { table: 'vehicle_images', action: 'update', recordIdFromInput: (input) => input.imageId },
      audit,
    ),
    deleteVehicleImage: withAudit(
      new DeleteVehicleImageUseCase(vehicles),
      { table: 'vehicle_images', action: 'delete', recordIdFromInput: (input) => input.imageId },
      audit,
    ),
    createBrand: withAudit(
      new CreateVehicleBrandUseCase(vehicleCatalog),
      { table: 'vehicle_brands', action: 'insert', recordIdFromOutput: (brand) => brand.id },
      audit,
    ),
    updateBrand: withAudit(
      new UpdateVehicleBrandUseCase(vehicleCatalog),
      { table: 'vehicle_brands', action: 'update', recordIdFromInput: (input) => input.brandId },
      audit,
    ),
    createModel: withAudit(
      new CreateVehicleModelUseCase(vehicleCatalog),
      { table: 'vehicle_models', action: 'insert', recordIdFromOutput: (model) => model.id },
      audit,
    ),
    updateModel: withAudit(
      new UpdateVehicleModelUseCase(vehicleCatalog),
      { table: 'vehicle_models', action: 'update', recordIdFromInput: (input) => input.modelId },
      audit,
    ),
  });

  const clientsController = new ClientsController({
    getClient: new GetClientUseCase(clients),
    listClients: new ListClientsUseCase(clients),
    createClient: withAudit(
      new CreateClientUseCase(clients, catalog),
      { table: 'clients', action: 'insert', recordIdFromOutput: (client) => client.id },
      audit,
    ),
    updateClient: withAudit(
      new UpdateClientUseCase(clients, catalog),
      { table: 'clients', action: 'update', recordIdFromInput: (input) => input.clientId },
      audit,
    ),
    deleteClient: withAudit(
      new DeleteClientUseCase(clients),
      { table: 'clients', action: 'delete', recordIdFromInput: (input) => input.clientId },
      audit,
    ),
  });

  const suppliersController = new SuppliersController({
    getSupplier: new GetSupplierUseCase(suppliers),
    listSuppliers: new ListSuppliersUseCase(suppliers),
    createSupplier: withAudit(
      new CreateSupplierUseCase(suppliers),
      { table: 'suppliers', action: 'insert', recordIdFromOutput: (supplier) => supplier.id },
      audit,
    ),
    updateSupplier: withAudit(
      new UpdateSupplierUseCase(suppliers),
      { table: 'suppliers', action: 'update', recordIdFromInput: (input) => input.supplierId },
      audit,
    ),
    deleteSupplier: withAudit(
      new DeleteSupplierUseCase(suppliers),
      { table: 'suppliers', action: 'delete', recordIdFromInput: (input) => input.supplierId },
      audit,
    ),
  });

  const purchasesController = new PurchasesController({
    getPurchase: new GetPurchaseUseCase(purchases),
    listPurchases: new ListPurchasesUseCase(purchases),
    createPurchase: withAudit(
      new CreatePurchaseUseCase(unitOfWork, purchases, suppliers, catalog),
      { table: 'purchases', action: 'insert', recordIdFromOutput: (purchase) => purchase.id },
      audit,
    ),
    updatePurchase: withAudit(
      new UpdatePurchaseUseCase(purchases, suppliers, catalog),
      { table: 'purchases', action: 'update', recordIdFromInput: (input) => input.purchaseId },
      audit,
    ),
    changePurchaseStatus: withAudit(
      new ChangePurchaseStatusUseCase(unitOfWork, purchases),
      { table: 'purchases', action: 'update', recordIdFromInput: (input) => input.purchaseId },
      audit,
    ),
    deletePurchase: withAudit(
      new DeletePurchaseUseCase(purchases),
      { table: 'purchases', action: 'delete', recordIdFromInput: (input) => input.purchaseId },
      audit,
    ),
  });

  const expensesController = new ExpensesController({
    getExpense: new GetExpenseUseCase(expenses),
    listExpenses: new ListExpensesUseCase(expenses),
    getVehicleCostSummary: new GetVehicleCostSummaryUseCase(expenses, vehicles),
    createExpense: withAudit(
      new CreateExpenseUseCase(expenses, catalog, vehicles),
      { table: 'expenses', action: 'insert', recordIdFromOutput: (expense) => expense.id },
      audit,
    ),
    updateExpense: withAudit(
      new UpdateExpenseUseCase(expenses, catalog, vehicles),
      { table: 'expenses', action: 'update', recordIdFromInput: (input) => input.expenseId },
      audit,
    ),
    deleteExpense: withAudit(
      new DeleteExpenseUseCase(expenses),
      { table: 'expenses', action: 'delete', recordIdFromInput: (input) => input.expenseId },
      audit,
    ),
  });

  const quotationsController = new QuotationsController({
    getQuotation: new GetQuotationUseCase(quotations),
    listQuotations: new ListQuotationsUseCase(quotations),
    expireQuotations: new ExpireQuotationsUseCase(quotations, clock),
    createQuotation: withAudit(
      new CreateQuotationUseCase(quotations, clients, vehicles, catalog, clock),
      { table: 'quotations', action: 'insert', recordIdFromOutput: (quotation) => quotation.id },
      audit,
    ),
    updateQuotation: withAudit(
      new UpdateQuotationUseCase(quotations, catalog, clock),
      { table: 'quotations', action: 'update', recordIdFromInput: (input) => input.quotationId },
      audit,
    ),
    changeQuotationStatus: withAudit(
      new ChangeQuotationStatusUseCase(quotations),
      { table: 'quotations', action: 'update', recordIdFromInput: (input) => input.quotationId },
      audit,
    ),
    deleteQuotation: withAudit(
      new DeleteQuotationUseCase(quotations),
      { table: 'quotations', action: 'delete', recordIdFromInput: (input) => input.quotationId },
      audit,
    ),
  });

  const reservationsController = new ReservationsController({
    getReservation: new GetReservationUseCase(reservations),
    listReservations: new ListReservationsUseCase(reservations),
    expireReservations: new ExpireReservationsUseCase(unitOfWork, clock),
    createReservation: withAudit(
      new CreateReservationUseCase(unitOfWork, reservations, clients, clock),
      {
        table: 'reservations',
        action: 'insert',
        recordIdFromOutput: (reservation) => reservation.id,
      },
      audit,
    ),
    updateReservation: withAudit(
      new UpdateReservationUseCase(reservations),
      {
        table: 'reservations',
        action: 'update',
        recordIdFromInput: (input) => input.reservationId,
      },
      audit,
    ),
    cancelReservation: withAudit(
      new CancelReservationUseCase(unitOfWork, reservations),
      {
        table: 'reservations',
        action: 'update',
        recordIdFromInput: (input) => input.reservationId,
      },
      audit,
    ),
  });

  const salesController = new SalesController({
    getSale: new GetSaleUseCase(sales),
    listSales: new ListSalesUseCase(sales),
    getSalesSummary: new GetSalesSummaryUseCase(sales),
    listSalePayments: new ListSalePaymentsUseCase(sales),
    createSale: withAudit(
      new CreateSaleUseCase(unitOfWork, sales, clients, catalog, clock),
      { table: 'sales', action: 'insert', recordIdFromOutput: (sale) => sale.id },
      audit,
    ),
    updateSale: withAudit(
      new UpdateSaleUseCase(sales, users),
      { table: 'sales', action: 'update', recordIdFromInput: (input) => input.saleId },
      audit,
    ),
    completeSale: withAudit(
      new CompleteSaleUseCase(sales),
      { table: 'sales', action: 'update', recordIdFromInput: (input) => input.saleId },
      audit,
    ),
    cancelSale: withAudit(
      new CancelSaleUseCase(unitOfWork, sales),
      { table: 'sales', action: 'update', recordIdFromInput: (input) => input.saleId },
      audit,
    ),
    deleteSale: withAudit(
      new DeleteSaleUseCase(sales),
      { table: 'sales', action: 'delete', recordIdFromInput: (input) => input.saleId },
      audit,
    ),
    registerSalePayment: withAudit(
      new RegisterSalePaymentUseCase(unitOfWork, catalog),
      {
        table: 'sale_payments',
        action: 'insert',
        recordIdFromOutput: (output) => output.payment.id,
      },
      audit,
    ),
  });

  const catalogsController = new CatalogsController({
    listCatalogs: new ListCatalogsUseCase(catalog),
    createExpenseCategory: withAudit(
      new CreateExpenseCategoryUseCase(catalog),
      {
        table: 'expense_categories',
        action: 'insert',
        recordIdFromOutput: (category) => category.id,
      },
      audit,
    ),
  });

  return {
    db,
    pool,
    tokens,
    auditContext,
    controllers: {
      users: usersController,
      vehicles: vehiclesController,
      clients: clientsController,
      suppliers: suppliersController,
      purchases: purchasesController,
      expenses: expensesController,
      quotations: quotationsController,
      reservations: reservationsController,
      sales: salesController,
      catalogs: catalogsController,
    },
    async shutdown() {
      await db.destroy();
    },
  };
}
