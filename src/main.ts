import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ConfigService } from '@nestjs/config'
import { ValidationPipe } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'

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

	const configSwagger = new DocumentBuilder()
		.setTitle('Saas platofrm')
		.setDescription('The saas platofrm API description')
		.setVersion('1.0')
		.build()
	const documentFactory = () => SwaggerModule.createDocument(app, configSwagger)
	SwaggerModule.setup('docs', app, documentFactory)

	await app.listen(config.get('PORT') ?? 3000)
}
bootstrap()
