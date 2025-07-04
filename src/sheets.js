import { GoogleAuth } from 'google-auth-library'
import { google } from 'googleapis'

/**
 * @class GoogleSheetService
 * Esta clase encapsula toda la lógica para interactuar con Google Sheets.
 * Su principal responsabilidad es obtener los flujos de conversación y mantenerlos
 * en una caché para mejorar el rendimiento y evitar llamadas innecesarias a la API.
 */
class GoogleSheetService {
    constructor() {
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
        this.auth = new GoogleAuth({
            credentials,
            scopes: 'https://www.googleapis.com/auth/spreadsheets',
        })
        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
        
        this.sheetId = process.env.SHEET_ID
        
        this.flowsCache = null
        this.promptsCache = null
        this.lastFlowsFetch = 0
        this.lastPromptsFetch = 0
        this.cacheDuration = 5 * 60 * 1000
    }

    /**
     * Obtiene los flujos de conversación.
     * Primero intenta devolver los datos desde la caché. Si la caché está vacía o ha expirado,
     * consulta la API de Google Sheets y actualiza la caché.
     * @returns {Promise<Array<Object>>} Un array de objetos, donde cada objeto representa un flujo.
     */
    async getFlows() {
        const now = Date.now()
        if (this.flowsCache && now - this.lastFlowsFetch < this.cacheDuration) {
            console.log('✅ Usando caché de flujos.')
            return this.flowsCache
        }

        console.log('🔄 Caché expirada. Obteniendo flujos desde Google Sheets...')
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Flujos!A2:C',
            })

            const rows = response.data.values || []
            const headers = [
                'addKeyword',
                'addAnswer',
                'media',
            ]

            const flows = rows.map((row) => {
                const flow = {}
                headers.forEach((header, index) => {
                    flow[header] = row[index] || null
                })
                return flow
            })

            this.flowsCache = flows
            this.lastFlowsFetch = now
            console.log(`✅ Flujos cargados y cacheados correctamente. Total: ${flows.length}`)
            return flows
        } catch (error) {
            console.error('❌ Error al obtener datos de Google Sheets:', error)
            return []
        }
    }

    /**
     * Obtiene los prompts para la IA desde la hoja 'IA_Prompts'.
     * También utiliza su propio sistema de caché.
     * @returns {Promise<Array<Object>>} Un array de objetos, donde cada objeto es un par Clave/Valor.
     */
    async getPrompts() {
        const now = Date.now()
        if (this.promptsCache && now - this.lastPromptsFetch < this.cacheDuration) {
            console.log('✅ Usando caché de prompts.')
            return this.promptsCache
        }

        console.log('🔄 Caché expirada. Obteniendo prompts desde Google Sheets...')
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'IA_Prompts!A2:C',
            })

            const rows = response.data.values || []
            const settings = {}

            if (rows.length > 0 && rows[0][0]) {
                settings['system_prompt'] = rows[0][0]
            }

            rows.forEach(row => {
                const key = row[1]
                const value = row[2]
                if (key && value) {
                    settings[key] = value
                }
            })

            this.promptsCache = settings
            this.lastPromptsFetch = now
            console.log(`✅ Prompts cargados y cacheados correctamente.`, settings)
            return settings
        } catch (error) {
            console.error('❌ Error al obtener prompts de Google Sheets:', error)
            return {}
        }
    }
}

const googleSheetService = new GoogleSheetService()
// Exportamos la instancia para que pueda ser usada en otros archivos (como en app.js).
export default googleSheetService