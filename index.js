var app = require('express')()
var bodyParser = require('body-parser')
var http = require('http').Server(app)
var io = require('socket.io')(http)
var MongoClient = require('mongodb').MongoClient
var url = require('./db').url
var inProduction = require('./db').inProduction
var db
var ObjectId = require('mongodb').ObjectID
var hash = require('object-hash')
var sendpulse = require('sendpulse-api')
var API_USER_ID = require('./db').API_USER_ID
var API_SECRET = require('./db').API_SECRET
var TOKEN_STORAGE = require('./db').TOKEN_STORAGE


const { APP_PORT, APP_IP, APP_PATH } = process.env;

app.use(bodyParser.urlencoded({
    extended: true,
}))
app.use(bodyParser.json())
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.post('/auth/', (req, res) => {
    let data = req.body
    db.collection('user').findOne({login: data.username}).then((result) => {
        if(hash(data.password) === result.password){
            res.send(result)
        } else {
            res.send({failed: true})
        }
    })
})
app.get('/', function (req, res) {
    res.send('works')
})

io.on('connection', function (socket) {
    socket.on('init', (msg) => {
        let counter = 0
        // цикл, поиск по дб и эмит вызываются асинхронно,
        // надо узнать когда подгрузится последняя коллекция элементов
        msg.ent.forEach((ent, iter, arr) => {
            db.collection(ent).find({}).toArray((err, docs) => {
                socket.emit('init', {ent: ent, data: docs})
                counter++ // считаем сколько отработало
                if (counter === arr.length) { //если последний, то
                    socket.emit('inited')
                }
            })
        })
    })

    socket.on('add', (msg) => {
        db.collection(msg.ent).insert(msg.data)
        io.emit('add', {ent: msg.ent, data: msg.data})
    })

    socket.on('delete', (msg) => {
        db.collection(msg.ent).findOneAndDelete({_id: ObjectId(msg.data)}).then((result) => {
            io.emit('delete', {ent: msg.ent, data: msg.data})
        }).catch((err) => console.log(err))
    })

    socket.on('update', (msg) => {
        var id = msg.data._id
        delete msg.data._id
        db.collection(msg.ent).findOneAndUpdate({_id: ObjectId(id)},
            {$set: msg.data}).then((result) => {
            msg.data._id = id
            io.emit('update', {ent: msg.ent, data: msg.data})
        }).catch((err) => console.log(err))
    })

    socket.on('start_send', (msg) => {
        sendpulse.init(API_USER_ID,API_SECRET,TOKEN_STORAGE,function() {
            sendpulse.createAddressBook((res) => { //возвращает id книги // error { error_code: 203, message: 'Book name already in use' }
                if(res.id){//если создали книгу контактов
                    sendpulse.addEmails((res) => { //заполняем книгу адресами
                        console.log(res)
                    }, res.id, msg.emails)
                }
            }, hash(Date.now()))
        });
    })

});

MongoClient.connect(url).then((result) => {
    console.log("Connected successfully to server");
    db = result.db('crm1');
    if (!inProduction){
        http.listen(3000, function () {
            console.log('listening on *:3000');
        });
    } else {
        http.listen(APP_PORT, APP_IP, () => {
            console.log(`Server running at http://${APP_IP}:${APP_PORT}/`);
        });
    }
}).catch((error) => {
    console.log(error)
})
