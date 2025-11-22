// server.js

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bodyParser = require('body-parser');

// --- ИМПОРТЫ (ТОЛЬКО НЕОБХОДИМЫЕ БИБЛИОТЕКИ) ---
const axios = require('axios');
const sharp = require('sharp'); // Можно удалить, если не используете

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------------------------------
// 1. ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ И СХЕМЫ
// -----------------------------------------------------

const carSchema = new mongoose.Schema({
    make: String,
    model: String,
    image: String,
    predefined_combinations: [
        {
            disc_brand: String,
            disc_diameter: Number,
            predefined_image_url: String
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
    image_url: String,
});
const Disc = mongoose.model('Disc', discSchema);


// Подключение к MongoDB
mongoose.connect(process.env.MONGO_URI, {
    dbName: 'test' // <--- ДОБАВЬТЕ ЭТУ ОПЦИЮ с правильным именем вашей БД в Atlas
})
    .then(() => console.log('✅ MongoDB подключена успешно'))
    .catch(err => {
        console.error('❌ Ошибка подключения к MongoDB:', err);
        process.exit(1);
    });

// -----------------------------------------------------
// 2. MIDDLEWARE И НАСТРОЙКИ
// -----------------------------------------------------

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- НОВАЯ НАСТРОЙКА CORS ---
app.use(cors());

// --- Добавление корневого маршрута, чтобы избежать ошибки "Cannot GET /" ---
app.get('/', (req, res) => {
    res.send('API Server is running successfully!');
});


// --- Вспомогательные функции для работы с изображениями ---
async function downloadImageAndConvertToBase64(imageUrl) {
    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data);
        const mimeType = response.headers['content-type'];
        const base64 = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
        return { base64, mimeType };
    } catch (error) {
        console.error(`Ошибка при скачивании или обработке изображения с URL ${imageUrl}:`, error);
        throw new Error('Не удалось скачать или обработать изображение по URL.');
    }
}
async function getImageBase64(imageUrlOrBase64, mimeType = null) {
    if (typeof imageUrlOrBase64 === 'string' && imageUrlOrBase64.startsWith('data:')) {
        const actualMimeType = imageUrlOrBase64.substring(imageUrlOrBase64.indexOf(':') + 1, imageUrlOrBase64.indexOf(';'));
        return { base64: imageUrlOrBase64, mimeType: mimeType || actualMimeType || 'image/jpeg' };
    } else {
        return await downloadImageAndConvertToBase64(imageUrlOrBase64);
    }
}

// -----------------------------------------------------
// 3. МАРШРУТЫ (API) - ПРЕФИКС /api УДАЛЕН
// -----------------------------------------------------

// БЫЛО: /api/cars, СТАЛО: /cars
app.get('/cars', async (req, res) => {
    try {
        const cars = await Car.find({});
        res.json(cars);
    } catch (err) {
        res.status(500).json({ message: 'Ошибка сервера при получении авто' });
    }
});

// БЫЛО: /api/discs, СТАЛО: /discs
app.get('/discs', async (req, res) => {
    try {
        const { diameter, width, pcd, et } = req.query;
        const filter = {};
        if (diameter) filter.diameter = diameter;
        if (width) filter.width = width;
        if (pcd) filter.pcd = pcd;
        if (et) filter.et = et;
        const discs = await Disc.find(filter);
        res.json(discs);
    } catch (err) {
        res.status(500).json({ message: 'Ошибка сервера при фильтрации дисков' });
    }
});

// БЫЛО: /api/disc-options, СТАЛО: /disc-options
app.get('/disc-options', async (req, res) => {
    try {
        const [diameters, widths, pcds, ets] = await Promise.all([
            Disc.distinct('diameter').sort(),
            Disc.distinct('width').sort(),
            Disc.distinct('pcd').sort(),
            Disc.distinct('et').sort(),
        ]);
        res.json({ diameters, widths, pcds, ets });
    } catch (err) {
        res.status(500).json({ message: 'Ошибка сервера при получении опций' });
    }
});


// БЫЛО: /api/replace-wheels, СТАЛО: /replace-wheels
app.post('/replace-wheels', async (req, res) => {
    try {
        // Ожидаем ID автомобиля и ID диска
        let { carId, discId } = req.body;

        if (!carId || !discId) {
            return res.status(400).json({ error: 'Требуются carId и discId.' });
        }
        
        // 1. Получаем информацию о машине и диске из БД
        const car = await Car.findById(carId);
        const disc = await Disc.findById(discId);

        if (!car || !disc) {
             const errorMsg = !car ? `Автомобиль с ID ${carId} не найден.` : `Диск с ID ${discId} не найден.`;
             return res.status(404).json({ error: errorMsg });
        }

        // 2. Ищем предопределенную комбинацию для этой машины и этого диска
        const predefinedCombination = car.predefined_combinations.find(
            // Используем бренд и диаметр для поиска совпадения
            combo => combo.disc_brand === disc.brand && combo.disc_diameter === disc.diameter
        );

        if (predefinedCombination && predefinedCombination.predefined_image_url) {
            // Если заготовка найдена
            
            // Проверяем, что это именно Toyota Corolla и Vossen (по требованию)
            const isTargetCombination = 
                car.make.toLowerCase() === 'toyota' && 
                car.model.toLowerCase() === 'corolla' && 
                disc.brand.toLowerCase() === 'vossen';

            if (!isTargetCombination) {
                // Если найдена заготовка, но это не Corolla+Vossen, и мы хотим отображать только их:
                return res.status(404).json({
                    error: "Поддерживается только комбинация Toyota Corolla + диски Vossen.",
                    message: "Пожалуйста, выберите Toyota Corolla и диски Vossen."
                });
            }

            console.log(`✅ Найдена предопределенная комбинация: ${car.make} ${car.model} с дисками ${disc.brand}.`);
            
            // Скачиваем изображение по URL и конвертируем его в Base64
            const { base64: resultImageBase64, mimeType: resultMimeType } = await downloadImageAndConvertToBase64(predefinedCombination.predefined_image_url);
            
            return res.json({
                message: "Загружено предопределенное изображение для данной комбинации.",
                resultImageBase64: resultImageBase64,
                mimeType: resultMimeType,
                fromPredefined: true // Флаг, указывающий, что это заготовка
            });

        } else {
            // Если заготовка не найдена
            console.warn(`⚠️ Предопределенная комбинация для ${car.make} ${car.model} с дисками ${disc.brand} не найдена.`);
            return res.status(404).json({
                error: "Для этой комбинации автомобиля и дисков нет заранее подготовленного изображения.",
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