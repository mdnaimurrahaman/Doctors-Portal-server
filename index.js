const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.z4f8y.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;


const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run(){
    try{
        await client.connect();
        const serviceCollection = client.db('doctors_Portal').collection('services');
        const bookingCollection = client.db('doctors_Portal').collection('bookings');
      
        app.get('/service', async(req, res) =>{
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        });

        app.get('/available', async(req, res)=>{
          const date = req.query.date || 'May 15, 2022';

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
       * app.delete("/booking/:id") //  delete specific one booking 
      */

        app.post('/booking', async(req, res) =>{
          const booking = req.body;
          const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient}
          const exists = await bookingCollection.findOne(query);
          if(exists){
            return res.send({success: false, booking: exists})
          }
          const result = await bookingCollection.insertOne(booking);
          return res.send({success: true, result});
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