// server.js

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors'); 

// Загрузка переменных окружения (например, MONGO_URI)
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------------------------------
// 1. СХЕМЫ MONGOOSE
// -----------------------------------------------------

const carSchema = new mongoose.Schema({
    make: String,
    model: String,
    // ИЗМЕНЕНИЕ: Хранит Base64-строку для автомобиля
    image_base64: String, 
    predefined_combinations: [
        {
            disc_brand: String,
            disc_diameter: Number,
            // Хранит Base64-строку для результата примерки
            predefined_image_base64: String 
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
    image_url: String, // URL изображения диска
});
const Disc = mongoose.model('Disc', discSchema);


// -----------------------------------------------------
// 2. ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ
// -----------------------------------------------------

mongoose.connect(process.env.MONGO_URI, {
    // ВАЖНО: dbName должен соответствовать названию вашей БД в Atlas, если оно отличается от 'test'
    dbName: 'test' 
})
    .then(() => console.log('✅ MongoDB подключена успешно'))
    .catch(err => {
        console.error('❌ Ошибка подключения к MongoDB:', err.message);
        // Завершаем процесс, если не удалось подключиться к БД
        process.exit(1); 
    });

// -----------------------------------------------------
// 3. MIDDLEWARE
// -----------------------------------------------------

// Увеличиваем лимит для Base64 (необходимо для Base64 строк)
app.use(express.json({ limit: '15mb' })); 
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// Разрешаем CORS для доступа с фронтенда
app.use(cors());

app.get('/', (req, res) => {
    res.send('API Server is running successfully!');
});


// -----------------------------------------------------
// 4. МАРШРУТЫ API
// -----------------------------------------------------

// --- 4.1. Маршрут для получения всех автомобилей ---
app.get('/cars', async (req, res) => {
    try {
        const cars = await Car.find({});
        res.json(cars);
    } catch (err) {
        res.status(500).json({ message: 'Ошибка сервера при получении авто', error: err.message });
    }
});

// --- 4.2. МАРШРУТ ДЛЯ ПОЛУЧЕНИЯ ВСЕХ ОПЦИЙ ФИЛЬТРАЦИИ (НЕДОСТАЮЩИЙ) ---
app.get('/disc-options', async (req, res) => {
    try {
        // Используем 'distinct' для получения всех уникальных значений
        const diameters = await Disc.distinct('diameter');
        const widths = await Disc.distinct('width');
        const pcds = await Disc.distinct('pcd');
        const ets = await Disc.distinct('et');

        res.json({
            // Сортируем числовые параметры
            diameters: diameters.sort((a, b) => a - b),
            widths: widths.sort((a, b) => a - b),
            pcds: pcds.sort(), // PCD может быть строкой (5x114.3)
            ets: ets.sort((a, b) => a - b)
        });
    } catch (err) {
        console.error('Ошибка сервера при получении опций дисков:', err);
        res.status(500).json({ message: 'Ошибка сервера при получении опций дисков' });
    }
});

// --- 4.3. Маршрут для получения дисков по фильтрам ---
app.get('/discs', async (req, res) => {
    try {
        const filter = {};
        const { diameter, width, pcd, et } = req.query;

        if (diameter) filter.diameter = parseInt(diameter);
        if (width) filter.width = parseInt(width);
        if (pcd) filter.pcd = pcd;
        if (et) filter.et = parseInt(et);

        const discs = await Disc.find(filter).limit(100);
        res.json(discs);

    } catch (err) {
        res.status(500).json({ message: 'Ошибка сервера при фильтрации дисков', error: err.message });
    }
});

// --- 4.4. Маршрут для получения заготовленного изображения примерки ---
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

        // Ищем предопределенную комбинацию по бренду и диаметру
        const predefinedCombination = car.predefined_combinations.find(
            combo => combo.disc_brand === disc.brand && combo.disc_diameter === disc.diameter
        );

        if (predefinedCombination && predefinedCombination.predefined_image_base64) {
            
            // Логика проверки на конкретную комбинацию (Toyota Corolla + Vossen)
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
            
            // Возвращаем Base64 строку с результатом примерки
            return res.json({
                message: "Загружено предопределенное изображение из базы данных.",
                resultImageBase64: predefinedCombination.predefined_image_base64,
                fromPredefined: true 
            });

        } else {
            // Комбинация не найдена
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
// 5. ЗАПУСК СЕРВЕРА
// -----------------------------------------------------

app.listen(PORT, () => {
    console.log(`🚀 API запущен на порту ${PORT}`);
});