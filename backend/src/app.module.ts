import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { StockModule } from './stock/stock.module';
import { CustomersModule } from './customers/customers.module';
import { SalesModule } from './sales/sales.module';
import { RepairsModule } from './repairs/repairs.module';
import { ShiftsModule } from './shifts/shifts.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { SerialsModule } from './serials/serials.module';
import { ClaimsModule } from './claims/claims.module';
import { PermissionsModule } from './permissions/permissions.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { CarrierWalletModule } from './carrier-wallet/carrier-wallet.module';
import { ExpensesModule } from './expenses/expenses.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BackupModule } from './backup/backup.module';
import { WarrantiesModule } from './warranties/warranties.module';
import { TechniciansModule } from './technicians/technicians.module';
import { DataModule } from './data/data.module';
import { BranchesModule } from './branches/branches.module';
import { DebtPaymentsModule } from './debt-payments/debt-payments.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AlertsModule }     from './alerts/alerts.module';
import { RemindersModule }  from './reminders/reminders.module';
import { PublicRegisterModule } from './public-register/public-register.module';
import { FilesModule } from './files/files.module';
import { ModulesModule } from './modules/modules.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Load environment-specific .env file first, then fall back to .env
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
    }),
    // P0-3: Named throttlers — each auth endpoint gets its own independent counter.
    // No APP_GUARD registered: only routes that explicitly add @UseGuards(ThrottlerGuard) are affected.
    ThrottlerModule.forRoot([
      { name: 'auth_login',    ttl: 15 * 60 * 1000, limit: 20 }, // 20 per 15 min
      { name: 'auth_register', ttl: 60 * 60 * 1000, limit: 3 },  // 3 per hour
    ]),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    StockModule,
    CustomersModule,
    SalesModule,
    RepairsModule,
    ShiftsModule,
    ReportsModule,
    SettingsModule,
    SubscriptionModule,
    SuppliersModule,
    PurchaseOrdersModule,
    SerialsModule,
    ClaimsModule,
    PermissionsModule,
    SuperAdminModule,
    CarrierWalletModule,
    ExpensesModule,
    AuditLogModule,
    NotificationsModule,
    BackupModule,
    WarrantiesModule,
    TechniciansModule,
    DataModule,
    BranchesModule,
    DebtPaymentsModule,
    DashboardModule,
    AnalyticsModule,
    AlertsModule,
    RemindersModule,
    PublicRegisterModule,
    FilesModule,
    ModulesModule,
  ],
})
export class AppModule {}
