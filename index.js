var app = require('express')()
var session = require('express-session')
var bodyParser = require('body-parser')
var http = require('http').Server(app)
var io = require('socket.io')(http)
var MongoClient = require('mongodb').MongoClient
var url = require('./db').url
var inProduction = require('./db').inProduction
var db
var ObjectId = require('mongodb').ObjectID
var hash = require('object-hash')
var uniqid = require('uniqid')
var sendpulse = require('sendpulse-api')
var API_USER_ID = require('./db').API_USER_ID
var API_SECRET = require('./db').API_SECRET
var TOKEN_STORAGE = require('./db').TOKEN_STORAGE
var SENDER_EMAIL = require('./db').SENDER_EMAIL


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

app.sessions = []

app.post('/auth/', (req, res) => {
    let data = req.body
    if(data.token) {
        let session = app.sessions.find((el) => {
            return el.token === data.token
        })
        if(session){
            res.send(session)
        }
    } else {
        db.collection('user').findOne({login: data.username}).then((result) => {
            if(hash(data.password) === result.password){
                result.token = uniqid()
                result.password = ""
                app.sessions.push(result)
                res.send(result)
            } else {
                res.send({failed: true})
            }
        })
    }
})
app.get('/', function (req, res) {
    console.log(req)
    res.send('works')
})



io.on('connection', function (socket) {
    socket.on('init', (msg) => {
        let counter = 0
        let token = app.sessions.find((el) => {
            return el.token === msg.token
        })
        if(token){
            msg.ent.forEach((ent, iter, arr) => {
                db.collection(ent).find({}).toArray((err, docs) => {
                    socket.emit('init', {ent: ent, data: docs})
                    counter++ // считаем сколько отработало
                    if (counter === arr.length) { //если последний, то
                        socket.emit('inited', {result: true})
                    }
                })
            })
        } else {
            socket.emit('inited', {result: false})
        }
        // цикл, поиск по дб и эмит вызываются асинхронно,
        // надо узнать когда подгрузится последняя коллекция элементов
    })

    socket.on('add', (msg) => {
        db.collection(msg.ent).insert(msg.data)
        io.emit('add', {ent: msg.ent, data: msg.data})
    })

    socket.on('delete', (msg) => {
        db.collection(msg.ent).findOneAndDelete({_id: ObjectId(msg.data)}).then((result) => {
            // console.log(result)
            io.emit('delete', {ent: msg.ent, data: msg.data})
        }).catch((err) => console.log(err))
    })

    socket.on('update', (msg) => {
        let id = msg.data._id
        delete msg.data._id
        db.collection(msg.ent).findOneAndUpdate({_id: ObjectId(id)},
            {$set: msg.data}).then((result) => {
                if(result.ok){
                    msg.data._id = id
                    io.emit('update', {ent: msg.ent, data: msg.data})
                }
                else console.log(result)
        }).catch((err) => console.log(err))
    })

    socket.on('start_send', (msg) => {
        sendpulse.init(API_USER_ID,API_SECRET,TOKEN_STORAGE,function() {
            sendpulse.createAddressBook((book) => { //возвращает id книги // error { error_code: 203, message: 'Book name already in use' }
                console.log('book',book)
                if(book.id){//если создали книгу контактов
                    sendpulse.addEmails((added) => { //заполняем книгу адресами
                        console.log('added', added)
                        if(added.result){
                            sendpulse.getBookInfo((bookInfo) => {
                                console.log('bookInfo', bookInfo[0])
                                if(bookInfo[0].status === 0){ // проверяем состояние книги, если 0, то можно рассылать
                                    sendpulse.createCampaign((res) => {
                                        console.log(res)
                                    }, "ИМИТ ВолГУ", SENDER_EMAIL, msg.subject, msg.template,
                                        book.id)
                                }
                            }, book.id)

                        }
                    }, book.id, msg.emails)
                }
            }, uniqid())
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
