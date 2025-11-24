// server.js

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors'); 
const bodyParser = require('body-parser');

// --- ИМПОРТЫ (Оставлен только Express и Mongoose) ---
// axios и sharp больше не нужны
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------------------------------
// 1. ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ И СХЕМЫ (ИЗМЕНЕНИЕ СХЕМЫ)
// -----------------------------------------------------

const carSchema = new mongoose.Schema({
    make: String,
    model: String,
    image: String, // URL исходного изображения автомобиля
    predefined_combinations: [
        {
            disc_brand: String,
            disc_diameter: Number,
            // НОВОЕ ПОЛЕ: Храним готовую Base64-строку здесь
            predefined_image_base64: String 
        }
    ]
});
const Car = mongoose.model('Car', carSchema);
// ... discSchema и Disc остаются без изменений ...

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

// Увеличиваем лимит, так как Base64-строки большие
app.use(express.json({ limit: '15mb' })); 
app.use(express.urlencoded({ limit: '15mb', extended: true }));

app.use(cors());

app.get('/', (req, res) => {
    res.send('API Server is running successfully!');
});


// --- Вспомогательные функции для работы с изображениями (УДАЛЕНЫ) ---
// downloadImageAndConvertToBase64 и getImageBase64 удалены.


// -----------------------------------------------------
// 3. МАРШРУТЫ (С ИЗМЕНЕННЫМ /replace-wheels)
// -----------------------------------------------------

// Маршруты /cars, /discs, /disc-options остаются без изменений
app.get('/cars', async (req, res) => {
    try {
        const cars = await Car.find({});
        res.json(cars);
    } catch (err) {
        res.status(500).json({ message: 'Ошибка сервера при получении авто' });
    }
});

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


// --- ИЗМЕНЕНИЕ: Маршрут /replace-wheels (Получение Base64) ---
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

        // 2. Ищем предопределенную комбинацию
        const predefinedCombination = car.predefined_combinations.find(
            combo => combo.disc_brand === disc.brand && combo.disc_diameter === disc.diameter
        );

        // ИСПОЛЬЗУЕМ НОВОЕ ПОЛЕ: predefined_image_base64
        if (predefinedCombination && predefinedCombination.predefined_image_base64) {
            
            // Проверка на Corolla + Vossen (оставляем по требованию)
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
            
            // ПРЯМОЕ ВОЗВРАЩЕНИЕ Base64-СТРОКИ ИЗ БД
            return res.json({
                message: "Загружено предопределенное изображение из базы данных.",
                resultImageBase64: predefinedCombination.predefined_image_base64,
                // mimeType больше не нужен, так как он включен в Base64-строку (data:image/jpeg;base64,...)
                fromPredefined: true 
            });

        } else {
            // Если Base64-строка не найдена
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