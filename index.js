const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

var nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.z4f8y.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;


const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

//Verify Token-----------------//
function verifyJWT(req, res, next){
  const authHeader = req.headers.authorization;
  if(!authHeader){
    return res.status(401).send({message: 'UnAuthorize access'});
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded){
    if(err){
      console.log(err)
      return res.status(403).send({message: 'Forbidden access'})
    }
    req.decoded = decoded;
    next();
  });
}

//------------------------

const emailSenderOptions = {
  auth: {
    api_user: 'SENDGRID_USERNAME',
    api_key: 'SENDGRID_PASSWORD'
  }
}

const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));

// user send mail function
function sendAppointmentEmail(booking){
  const {patient, patientName, treatment, date, slot} = booking;

  var email = {
    from: process.env.EMAIL_SENDER,
    to: patient,
    subject: `Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed` ,
    text: `Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed`,
    html: `
    <div>
      <p>Hello ${patientName},</p>
      <h3>Your Appointment for ${treatment} is confirmed</h3>
      <p>Looking forward to seeing you on ${date} at ${slot}.</p>
      <h3>Our Address</h3>
      <p>Andor killa Bandorban</p>
    </div>
    `
  };

  emailClient.sendMail(email, function(err, info){
    if (err ){
      console.log(err);
    }
    else {
      console.log('Message sent: ', info);
    }
});
  

}
//---------------------------------------


async function run(){
    try{
        await client.connect();
        const serviceCollection = client.db('doctors_Portal').collection('services');
        const bookingCollection = client.db('doctors_Portal').collection('bookings');
        const userCollection = client.db('doctors_Portal').collection('users');
        const doctorCollection = client.db('doctors_Portal').collection('doctors');


      const verifyAdmin = async (req, res, next) => {

        const requester = req.decoded.email;
        const requesterAccount = await userCollection.findOne({email: requester});
          if (requesterAccount.role === 'admin'){
            next()
          }
          else{
            res.status(403).send({message: 'forbidden'})
          }
      }

      
        app.get('/service', async(req, res) =>{
            const query = {};
            const cursor = serviceCollection.find(query).project({name: 1});
            const services = await cursor.toArray();
            res.send(services);
        });

        app.get('/user',verifyJWT, async(req, res)=>{
          const users = await userCollection.find().toArray();
          res.send(users)

        })

        // create admin user
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async(req, res)=>{
          const email = req.params.email;
          const filter = {email: email};
          const updateDoc = {
            $set: {role: 'admin'},
          };
          const result = await userCollection.updateOne(filter, updateDoc);
          res.send(result);

        })

        // admin checkup Api 
        app.get('/admin/:email', async(req, res)=>{
          const email = req.params.email;
          const user = await userCollection.findOne({email: email});
          const isAdmin = user.role === 'admin';
          res.send({admin: isAdmin})
        })




        app.put('/user/:email', async(req, res)=>{
          const email = req.params.email;
          const user = req.body;
          const filter = {email: email};
          const options = {upsert: true};
          const updateDoc = {
            $set: user,
          };
          const result = await userCollection.updateOne(filter, updateDoc, options);
          const token = jwt.sign({email:email}, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '7d'});
          res.send({result, token });

        })


        // THIS IS NOT THE PROPER WAY TO QUERY.
        // AFTER LEARNING MORE ABOUT MONGODB . USE AGGREGATE LOOKUP , PIPELINE, MATCH , GROUP .

        app.get('/available', async(req, res)=>{
          const date = req.query.date;

          // step 1 : get all services
          const services = await serviceCollection.find().toArray();
          // res.send(services)
          
          // step 2 : get the booking of the day
          const query = {date: date};
          const bookings = await bookingCollection.find(query).toArray();

          // step 3: for each service, find bookings for that service . OutPut[{},{},{},{},{}]
          services.forEach(service => {
            // step 4 : find bookings for that service. OutPut [{},{},{}]
            const serviceBookings = bookings.filter(book => book.treatment === service.name);
            //step 5 : select slots for the service Bookings: [ '', '', '']
            const booked = serviceBookings.map(book => book.slot);
            // step 6 : select those slots that are not in bookedSlots
            const available = service.slots.filter(slot => !booked.includes(slot))
            // step 7 : set available to slots to make it easier
            service.slots = available;
            
            // service.booked = serviceBookings.map(s => s.slot);
          })
          res.send(services);
        })

        /**
       * Api naming Convention
       * app.get("/booking") // get all bookings in this collection. or get more than one or by filter
       * app.get("/booking") // get a specific booking 
       * app.get("/booking") // add a new booking 
       * app.patch("/booking/:id") //  update specific one booking
       * app.put('booking/:id') // update (if exists) or insert (if doesn't exists)
       * app.delete("/booking/:id") //  delete specific one booking 
      */

        app.get('/booking', verifyJWT, async(req,res)=>{
          const patient = req.query.patient;
          const decodedEmail = req.decoded.email;
          if(patient === decodedEmail){
            const query = {patient: patient};
            const bookings = await bookingCollection.find(query).toArray();
            return res.send(bookings);
          }
          else{
            return res.status(403).send({message: 'forbidden access'});
          }
        })

        // id to get spesipic user booking.
        app.get('/booking/:id', verifyJWT, async(req, res)=>{
          const id = req.params.id;
          const query = {_id: ObjectId(id)};
          const booking = await bookingCollection.findOne(query);
          res.send(booking)
        })

        app.post('/booking', async(req, res) =>{
          const booking = req.body;
          const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient}
          const exists = await bookingCollection.findOne(query);
          if(exists){
            return res.send({success: false, booking: exists})
          }
          const result = await bookingCollection.insertOne(booking);
          // sendAppointmentEmail(booking)
          return res.send({success: true, result});
        });

        // Doctors get api
        app.get('/doctor', verifyJWT, verifyAdmin, async(req, res) => {
          const doctors = await doctorCollection.find().toArray();
          res.send(doctors)
        })

        // Doctors api creating
        app.post('/doctor',verifyJWT, verifyAdmin, async(req, res) => {
          const doctor = req.body;
          const result = await doctorCollection.insertOne(doctor);
          res.send(result);
        })


    }
    finally{

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello from Doctor Uncle!')
})

app.listen(port, () => {
  console.log(`Doctors app listening on port ${port}`)
})

//  // Doctors api creating
//  app.post('/doctor',verifyJWT, verifyAdmin, async(req, res) => {
//   const doctor = req.body;
//   const result = await doctorCollection.insertOne(doctor);
//   res.send(result);
// })
