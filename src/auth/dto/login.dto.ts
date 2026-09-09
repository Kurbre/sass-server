import {
	IsEmail,
	IsNotEmpty,
	IsString,
	MaxLength,
	MinLength
} from 'class-validator'

export class LoginDto {
	@IsString()
	@IsNotEmpty()
	login!: string

	@IsString()
	@IsNotEmpty()
	@MinLength(6)
	@MaxLength(32)
	password!: string
}
