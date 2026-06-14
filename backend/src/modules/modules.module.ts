import { Global, Module } from '@nestjs/common';
import { ModulesService } from './modules.service';
import { ModulesController, SAModulesController } from './modules.controller';
import { ModuleGuard } from '../common/guards/module.guard';

@Global()
@Module({
  controllers: [ModulesController, SAModulesController],
  providers:   [ModulesService, ModuleGuard],
  exports:     [ModulesService, ModuleGuard],
})
export class ModulesModule {}
