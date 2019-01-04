var app = require('express')();
var bodyParser = require('body-parser')
var http = require('http').Server(app);
var io = require('socket.io')(http);
var MongoClient = require('mongodb').MongoClient;
// var url = 'mongodb://admin:100_Begem0ts@ds135844.mlab.com:35844/crm1';
var url = require('./db').url;
var db;
var ObjectId = require('mongodb').ObjectID;
var hash = require('object-hash')

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
app.get('/add-contact/', function (req, res) {
    for (let i = 0; i < 3000; i++) {
        db.collection('contact').insert({
            "id": i,
            "origin": Math.random(),
            "name": Math.random(),
            "patro": Math.random(),
            "surname": Math.random(),
            "level": Math.random(),
            "phone": Math.random(),
            "email": Math.random(),
            "vk": Math.random(),
            "birthday": "2018-12-03",
            "address": Math.random(),
            "datetime": "2018-12-19T17:59:46.007Z",
            "edu_id": 3,
            "status_id": 2,
            "type_id": 3,
            "user_id": 1,
            "event_ids": [
                1
            ]
        })
    }

})

io.on('connection', function (socket) {
    console.log('a user connected' + socket.id);

    socket.on('init', (msg) => {
        let counter = 0
        // цикл, поиск по дб и эмит вызываются асинхронно,
        // надо узнать когда подгрузится последняя коллекция элементов
        msg.ent.forEach((ent, iter, arr) => {
            db.collection(ent).find({}).toArray((err, docs) => {
                socket.emit('init', {ent: ent, data: docs})
                counter++ // считаем сколько отработало
                if (counter === arr.length) { //если последний, то
                    console.log('inited')
                    socket.emit('inited')
                }
            })
        })
        console.log('ended')

    })

    socket.on('add', (msg) => {
        console.log('add_' + msg.ent)
        db.collection(msg.ent).insert(msg.data)
        io.emit('add', {ent: msg.ent, data: msg.data})
    })

    socket.on('delete', (msg) => {
        console.log('delete_' + msg.ent)
        console.log(msg.data)
        db.collection(msg.ent).findOneAndDelete({_id: ObjectId(msg.data)}).then((result) => {
            console.log(result)
            io.emit('delete', {ent: msg.ent, data: msg.data})
        }).catch((err) => console.log(err))
    })

    socket.on('update', (msg) => {
        console.log('update_')
        var id = msg.data._id
        delete msg.data._id
        db.collection(msg.ent).findOneAndUpdate({_id: ObjectId(id)},
            {$set: msg.data}).then((result) => {
            console.log(result)
            msg.data._id = id
            io.emit('update', {ent: msg.ent, data: msg.data})
        }).catch((err) => console.log(err))
    })

});

MongoClient.connect(url).then((result) => {
    console.log("Connected successfully to server");
    db = result.db('crm1');
    http.listen(3000, function () {
        console.log('listening on *:3000');
    });
}).catch((error) => {
    console.log(error)
})
// MongoClient.connect(url, function(err, client) {
//
//     const db = client.db('crm1');
//
// })