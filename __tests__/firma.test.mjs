import request from 'supertest';
import * as test from "node:test";
import jest from 'jest'; // Esto puede ser necesario en algunos entornos de prueba

// Simulación de la respuesta de confirmación de firma
jest.mock('../src/services/documento.service', () => ({
    confirmSignature: jest.fn(() => Promise.resolve({
        documento_id: 555,
        usuario_id: 123,
        signedPdfPath: 'uploads/signed/1773797562686-signed.pdf',  // Ruta simulada
    })),
}));

describe('Confirmar firma de documento', () => {
    test('200 OK cuando se confirma la firma', async () => {
        // Endpoint de la API que se va a probar
        const signedPdfPath = './uploads/signed/test-signed.pdf'; // Ruta del archivo de prueba

        // Realizamos la petición POST con el archivo adjunto
        const res = await request('http://localhost:3000') // Ajusta la URL
            .post('/documentos/555/firma/confirmar') // Ruta a probar
            .attach('file', signedPdfPath); // Usamos `.attach()` para adjuntar el archivo de prueba

        // Comprobamos que la respuesta es OK
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.documento_id).toBe(555);
        expect(res.body.estado).toBe('FIRMA_PARCIAL'); // Asumiendo este estado esperado
    });

    test('403 Forbidden cuando el usuario no tiene permisos para firmar', async () => {
        // Simulamos un error de permisos
        jest.mock('../src/services/documento.service', () => ({
            confirmSignature: jest.fn(() => Promise.reject({
                error: 'FORBIDDEN',
                message: 'No estás asignado como firmante para este documento.',
            })),
        }));

        const signedPdfPath = './uploads/signed/test-signed.pdf'; // Ruta del archivo de prueba

        // Realizamos la petición POST con el archivo adjunto
        const res = await request('http://localhost:3000') // Ajusta la URL
            .post('/documentos/555/firma/confirmar') // Ruta a probar
            .attach('file', signedPdfPath); // Usamos `.attach()` para adjuntar el archivo de prueba

        // Verificamos que la respuesta sea un error 403
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('FORBIDDEN');
        expect(res.body.message).toBe('No estás asignado como firmante para este documento.');
    });

    test('500 Internal Error para errores no manejados', async () => {
        // Simulamos un error inesperado
        jest.mock('../src/services/documento.service', () => ({
            confirmSignature: jest.fn(() => Promise.reject({
                error: 'internal_error',
                message: 'Algo salió mal con la firma.',
            })),
        }));

        const signedPdfPath = './uploads/signed/test-signed.pdf'; // Ruta del archivo de prueba

        // Realizamos la petición POST con el archivo adjunto
        const res = await request('http://localhost:3000') // Ajusta la URL
            .post('/documentos/555/firma/confirmar') // Ruta a probar
            .attach('file', signedPdfPath); // Usamos `.attach()` para adjuntar el archivo de prueba

        // Verificamos que la respuesta sea un error 500
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('internal_error');
        expect(res.body.message).toBe('Algo salió mal con la firma.');
    });
});