import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { GlobalThrottlerGuard } from './common/guards/global-throttler.guard';
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
import { PublicTrackingModule } from './public-tracking/public-tracking.module';
import { LineMessagingModule } from './line-messaging/line-messaging.module';
import { FilesModule } from './files/files.module';
import { ModulesModule } from './modules/modules.module';
import { TenantModule } from './tenant/tenant.module';
import { ChatModule } from './chat/chat.module';
import { CashDrawerModule } from './cash-drawer/cash-drawer.module';
import { AccountingModule } from './accounting/accounting.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';

@Module({
  controllers: [HealthController],
  providers: [
    // RC2-002: Apply 300 req/min default throttle globally. Named auth throttlers
    // (auth_login etc.) are skipped by GlobalThrottlerGuard and remain per-route only.
    { provide: APP_GUARD, useClass: GlobalThrottlerGuard },
  ],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Load environment-specific .env file first, then fall back to .env
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
    }),
    // RC2-002: 'default' throttler is enforced globally via GlobalThrottlerGuard (APP_GUARD).
    // Named throttlers are per-route opt-in only — GlobalThrottlerGuard skips them so they
    // never leak onto general API endpoints.
    ThrottlerModule.forRoot([
      { name: 'default',         ttl: 60 * 1000,        limit: 300 }, // 300 per minute (all routes)
      { name: 'auth_login',      ttl: 60 * 1000,        limit: 20  }, // 20 per minute (login only)
      { name: 'auth_register',   ttl: 60 * 60 * 1000,  limit: 3   }, // 3 per hour (register only)
      { name: 'auth_change_pwd', ttl: 15 * 60 * 1000,  limit: 5   }, // 5 per 15 min (change-pwd only)
      { name: 'public_tracking', ttl: 60 * 1000,        limit: 60  }, // 60 per minute (public tracking)
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
    PublicTrackingModule,
    LineMessagingModule,
    FilesModule,
    ModulesModule,
    TenantModule,
    ChatModule,
    CashDrawerModule,
    AccountingModule,
    ReconciliationModule,
  ],
})
export class AppModule {}
