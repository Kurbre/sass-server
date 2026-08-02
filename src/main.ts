import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ConfigService } from '@nestjs/config'
import { ValidationPipe } from '@nestjs/common'
import cookieParser from 'cookie-parser'

async function bootstrap() {
	const app = await NestFactory.create(AppModule)
	const config = app.get(ConfigService)

	app.enableCors({
		origin: config.getOrThrow<string>('CLIENT_URL'),
		credentials: true
	})

	app.use(cookieParser())

	app.setGlobalPrefix('api')

	app.useGlobalPipes(
		new ValidationPipe({
			transform: true,
			whitelist: true
		})
	)

	console.log(process.cwd())

	await app.listen(config.get('PORT') ?? 3000)
}
bootstrap()
