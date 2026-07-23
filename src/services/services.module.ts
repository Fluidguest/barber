import { Module } from '@nestjs/common';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [ServicesController],
  providers: [ServicesService, CategoriesService],
})
export class ServicesModule {}
