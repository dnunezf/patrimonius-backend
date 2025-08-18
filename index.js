const express = require('express');
const app = express();
const cors = require('cors');
app.use(cors());
app.use(express.json());

app.post('/formulario', (req, res) => {
  console.log('Datos recibidos:', req.body);
  res.json({ mensaje: 'Datos recibidos correctamente', datos: req.body });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor Express corriendo en puerto ${PORT}`);
});
