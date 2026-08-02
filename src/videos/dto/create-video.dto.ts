import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CreateVideoDto {
	@IsString()
	@IsNotEmpty()
	description!: string

	@IsDateString()
	@IsOptional()
	scheduledTime?: string
}
