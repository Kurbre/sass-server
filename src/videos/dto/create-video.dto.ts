import {
	IsDateString,
	IsNotEmpty,
	IsOptional,
	IsString,
	Matches
} from 'class-validator'

export class CreateVideoDto {
	@IsString()
	@IsNotEmpty()
	description!: string

	@IsString()
	@IsNotEmpty()
	accountId!: string

	@Matches(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/, {
		message: 'Дата должна быть в формате DD.MM.YYYY HH:mm'
	})
	@IsOptional()
	scheduledTime?: string
}
