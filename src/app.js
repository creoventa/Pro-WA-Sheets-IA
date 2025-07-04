import 'dotenv/config'
import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import googleSheetService from './sheets.js'
import groqService from './ai-chat.js'
import chatHistoryService from './chat-history.js'

const PORT = process.env.PORT ?? 3008

const dynamicFlow = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, { flowDynamic }) => {
        const flows = await googleSheetService.getFlows()
        const userInput = ctx.body.toLowerCase().trim()

        const triggeredFlow = flows.find(f => {
            if (!f.addKeyword) return false
            const sheetKeyword = f.addKeyword.toLowerCase().trim()
            return userInput.includes(sheetKeyword)
        })

        if (triggeredFlow) {
            const answer = triggeredFlow.addAnswer
            const mediaUrl = triggeredFlow.media && triggeredFlow.media.trim()
            const phoneNumber = ctx.from
            
            await chatHistoryService.saveMessage(phoneNumber, 'user', userInput)
            await chatHistoryService.saveMessage(phoneNumber, 'assistant', answer)

            if (mediaUrl) {
                await flowDynamic(answer, { media: mediaUrl })
            } else {
                await flowDynamic(answer)
            }
        } else {
            console.log('🤖 No se encontró palabra clave, derivando a la IA...')
            const phoneNumber = ctx.from
            const aiResponse = await groqService.getResponse(userInput, phoneNumber)
            await flowDynamic(aiResponse)
        }
    })

const main = async () => {
    await googleSheetService.getFlows()
    await googleSheetService.getPrompts()
    
    setInterval(async () => {
        console.log('🧹 Iniciando limpieza automática del historial...')
        const deletedCount = await chatHistoryService.cleanOldHistories()
        console.log(`🧹 Limpieza completada. Archivos eliminados: ${deletedCount}`)
    }, 24 * 60 * 60 * 1000)
    
    const stats = await chatHistoryService.getStats()
    console.log('📊 Estadísticas del historial:', stats)

    const adapterFlow = createFlow([dynamicFlow])
    const adapterProvider = createProvider(Provider)
    const adapterDB = new Database()

    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    adapterProvider.server.post(
        '/v1/messages',
        handleCtx(async (bot, req, res) => {
            const { number, message, urlMedia } = req.body
            await bot.sendMessage(number, message, { media: urlMedia ?? null })
            return res.end('sended')
        })
    )

    adapterProvider.server.post(
        '/v1/register',
        handleCtx(async (bot, req, res) => {
            const { number, name } = req.body
            await bot.dispatch('REGISTER_FLOW', { from: number, name })
            return res.end('trigger')
        })
    )

    adapterProvider.server.post(
        '/v1/samples',
        handleCtx(async (bot, req, res) => {
            const { number, name } = req.body
            await bot.dispatch('SAMPLES', { from: number, name })
            return res.end('trigger')
        })
    )

    adapterProvider.server.post(
        '/v1/blacklist',
        handleCtx(async (bot, req, res) => {
            const { number, intent } = req.body
            if (intent === 'remove') bot.blacklist.remove(number)
            if (intent === 'add') bot.blacklist.add(number)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', number, intent }))
        })
    )

    httpServer(+PORT)
}

main()
