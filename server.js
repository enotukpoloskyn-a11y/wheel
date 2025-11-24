// server.js

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors'); 
const bodyParser = require('body-parser');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------------------------------
// 1. ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ И СХЕМЫ (ИЗМЕНЕНИЕ СХЕМЫ CAR)
// -----------------------------------------------------

const carSchema = new mongoose.Schema({
    make: String,
    model: String,
    // ИЗМЕНЕНИЕ: Теперь хранит Base64-строку вместо URL
    image_base64: String, 
    predefined_combinations: [
        {
            disc_brand: String,
            disc_diameter: Number,
            predefined_image_base64: String // Результат примерки
        }
    ]
});
const Car = mongoose.model('Car', carSchema);

const discSchema = new mongoose.Schema({
    brand: String,
    diameter: Number,
    width: Number,
    pcd: String,
    et: Number,
    dia: Number,
    price: Number,
    image_url: String, // URL изображения диска остается, чтобы не перегружать БД
});
const Disc = mongoose.model('Disc', discSchema);


// Подключение к MongoDB
mongoose.connect(process.env.MONGO_URI, {
    dbName: 'test' 
})
    .then(() => console.log('✅ MongoDB подключена успешно'))
    .catch(err => {
        console.error('❌ Ошибка подключения к MongoDB:', err);
        process.exit(1);
    });

// -----------------------------------------------------
// 2. MIDDLEWARE И НАСТРОЙКИ
// -----------------------------------------------------

// Увеличиваем лимит для Base64
app.use(express.json({ limit: '15mb' })); 
app.use(express.urlencoded({ limit: '15mb', extended: true }));

app.use(cors());

app.get('/', (req, res) => {
    res.send('API Server is running successfully!');
});


// --- Вспомогательные функции для работы с изображениями (УДАЛЕНЫ) ---
// ...

// -----------------------------------------------------
// 3. МАРШРУТЫ (БЕЗ ИЗМЕНЕНИЙ В ЛОГИКЕ, ТОЛЬКО ОБНОВЛЕННАЯ СХЕМА)
// -----------------------------------------------------

app.get('/cars', async (req, res) => {
    try {
        const cars = await Car.find({});
        // Теперь cars будет содержать image_base64
        res.json(cars);
    } catch (err) {
        res.status(500).json({ message: 'Ошибка сервера при получении авто' });
    }
});
// ... (Маршруты /discs и /disc-options остаются без изменений) ...

app.post('/replace-wheels', async (req, res) => {
    try {
        let { carId, discId } = req.body;

        if (!carId || !discId) {
            return res.status(400).json({ error: 'Требуются carId и discId.' });
        }
        
        const car = await Car.findById(carId);
        const disc = await Disc.findById(discId);

        if (!car || !disc) {
             const errorMsg = !car ? `Автомобиль с ID ${carId} не найден.` : `Диск с ID ${discId} не найден.`;
             return res.status(404).json({ error: errorMsg });
        }

        const predefinedCombination = car.predefined_combinations.find(
            combo => combo.disc_brand === disc.brand && combo.disc_diameter === disc.diameter
        );

        if (predefinedCombination && predefinedCombination.predefined_image_base64) {
            
            const isTargetCombination = 
                car.make.toLowerCase() === 'toyota' && 
                car.model.toLowerCase() === 'corolla' && 
                disc.brand.toLowerCase() === 'vossen';

            if (!isTargetCombination) {
                return res.status(404).json({
                    error: "Поддерживается только комбинация Toyota Corolla + диски Vossen.",
                    message: "Пожалуйста, выберите Toyota Corolla и диски Vossen."
                });
            }

            console.log(`✅ Найдена предопределенная комбинация: ${car.make} ${car.model} с дисками ${disc.brand}.`);
            
            return res.json({
                message: "Загружено предопределенное изображение из базы данных.",
                resultImageBase64: predefinedCombination.predefined_image_base64,
                fromPredefined: true 
            });

        } else {
            console.warn(`⚠️ Предопределенная комбинация для ${car.make} ${car.model} с дисками ${disc.brand} не найдена.`);
            return res.status(404).json({
                error: "Для этой комбинации автомобиля и дисков нет заранее подготовленного изображения в БД.",
                message: "Пожалуйста, выберите другую комбинацию."
            });
        }

    } catch (error) {
        console.error('❌ Ошибка сервера при поиске предопределенной комбинации:', error);
        res.status(500).json({
            error: `Ошибка сервера: ${error.message}`,
            message: "Ошибка сервера при получении изображения комбинации. Проверьте логи."
        });
    }
});


// -----------------------------------------------------
// 4. ЗАПУСК СЕРВЕРА
// -----------------------------------------------------

app.listen(PORT, () => {
    console.log(`🚀 API запущен на http://localhost:${PORT}`);
});