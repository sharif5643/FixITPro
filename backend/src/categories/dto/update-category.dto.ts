import { PartialType } from '@nestjs/mapped-types';
import { CreateCategoryDto } from './create-category.dto';
import { CreateCategoryTypeDto } from './create-category-type.dto';

/** Real classes so the validation pipe checks the body (a Partial<> type is not checked at all) */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
export class UpdateCategoryTypeDto extends PartialType(CreateCategoryTypeDto) {}
