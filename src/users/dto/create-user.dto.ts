import {
	IsEmail,
	IsNotEmpty,
	IsString,
	IsUrl,
	MaxLength,
	MinLength
} from 'class-validator'

export class CreateUserDto {
	@IsEmail()
	@IsNotEmpty()
	email!: string

	@IsString()
	@IsNotEmpty()
	@MinLength(6)
	@MaxLength(32)
	password!: string
}
