const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const session = require("express-session")
const mongoDbSession = require("connect-mongodb-session")(session)
const config = require("./config.js");
var cors = require("cors");
// Create the Express application
const app = express();
app.use(express.json());
app.use(cors());

const sessionStore = new mongoDbSession({
    uri: config.mongo_uri,
    collection: "LoginSessions",
})

app.use(session({
    secret: config.sessionSecretKey,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        secure: false, //if true then only transfer cookie over https
        httpOnly: true, //prevent client side js reading the cookie
        maxAge: 1000 * 60 * 30 //30 min max cookie time
    }
}));


const services = {
    "admin": {
        "Content Properties": "/contentProperties",
    },
    "nonadmin": {
        "Content Properties": "/contentProperties",
    }
}

const login_schema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true },
});

// Create a new collection based on the schema
const loginModel = mongoose.model("login_collection", login_schema);

const video_info_schema = new mongoose.Schema({
    ContentID: { type: String, unique: true, required: true },
    SubTitle: { type: String },
    AudioTrack: { type: String, required: true },
    Dash:
    {
        RootFolder: { type: String },
        Manifest: { type: String }
    },
    HLS: {
        RootFolder: { type: String },
        Manifest: { type: String }
    },
    DRM:
    {
        ResourceURL: { type: String },
        KeyID: { type: String }
    },
    Quality: [{ type: String, enum: ["HDR", "HD", "ATMOS"] }],
    LastUpdated: { type: Date, default: Date.now },
    LastUpdatedBy: { type: String }
});
// Create a new collection based on the schema
const video_info = mongoose.model("video_info_collection", video_info_schema);

async function connect() {
    try {
        await mongoose.connect(config.mongo_uri);
        console.log("\n\nSuccessfully Connected to DB.....");
        // const password = await bcrypt.hash("abc123", 10); // Specify the number of salt rounds
        // const user1 = new loginModel({
        //   username : "TestUser1",
        //   password: password,
        //   role: "admin"
        // });
        // const user2 = new loginModel({
        //     username : "TestUser2",
        //     password: password,
        //     role: "nonadmin"
        //   });
        // await user1.save();
        // await user2.save();

        // const sampleJob = new video_info({
        //     ContentID: "testId123", SubTitle: "testsub", AudioTrack: "track1",
        //     Dash: { RootFolder: "Folder1", Manifest: "manifest1" }, HLS: { RootFolder: "f2", Manifest: "manifest2" },
        //     DRM: { ResourceURL: "url1", KeyID: "key123" }, LastUpdatedBy: "testuser", Quality: ["HD", "ATMOS"]
        // });
        // await sampleJob.save().then(() => console.log("Done Successfully")).catch(err => console.log(err));
    } catch (error) {
        console.log(error);
    }
}

// Connect to the MongoDB database
connect();

const isLoggedIn = async (req, res, next) => {
    try {
        if (req.session && req.session.userId) {
            next();
            return;
        }
        else {
            res.status(401).json("Unauthorized")
            return;
        }
    }
    catch (error) {
        console.log(error);
        res.status(500).json("Internal Server Error");
        return;
    }
}

app.get("/home",isLoggedIn,(req,res)=>{
   return res.redirect("/mainPage");
})
app.post("/login", async (req, res) => {

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Basic ")) {
        res
            .status(401)
            .json({ message: "Authorization header missing or invalid" });
        return;
    }

    const credentials = authHeader.slice(6);
    const decodedCredentials = Buffer.from(credentials, "base64").toString();
    const [username, password] = decodedCredentials.split(":");

    try {
        const user = await loginModel.findOne({ username: username });

        if (!user) {
            return res.status(401).json({ message: "Invalid username or password" });
        }

        const result = await bcrypt.compare(password, user.password);
        if (!result) {
            return res.status(401).json({ message: "Invalid username or password" });
        }

        req.session.userId = username;
        req.session.role = user.role;
        console.log("\nSuccess Authorization.....");
        res.status(200).json({user:username,role:user.role,login:"authorized"})
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/mainPage", isLoggedIn, (req, res) => {
    const role = req.session.role;
    const user = req.session.userId;

    return res.status(200).json({user, role,...services[`${role}`]})
})

app.get("/test", (req, res) => {
    req.session.userId = "testuser";
    req.session.role = "admin";
    console.log("\nSuccess Authorization.....");
    return res.status(200).json(req.session)
})

app.get("/contentProperties/:id", isLoggedIn, async (req, res) => {
    const id = req.params["id"];
    try {
        const data = await video_info.findOne({ ContentID: id });
        if (data) {
           // console.log(data)
            res.status(200).json([data,req.session.userId,req.session.role])
            return;
        }
        else{
            res.status(400).json("Not Found")
            return;
        }
    } catch (error) {
        res.status(500).json("Internal Server Error")
        return;
    }


})

app.post("/contentProperties", isLoggedIn, async (req, res) => {
    if(req.session.role != "admin"){
        res.status(401).json("Unauthorized");
        return;
    }
    const data = req.body;
    try {
        console.log(data)
        const sampleJob = new video_info(data);
        await sampleJob.save();
        console.log("Saved Successfully...");
        res.status(200).json("Data Inserted Successfully");
        return
    } catch (error) {
        console.log(error)
        res.status(500).json("Internal Server Error")
        return
    }
})

app.put("/contentProperties", isLoggedIn, async (req, res) => {
    if(req.session.role !== "admin"){
        res.status(401).json("Unauthorized");
        return;
    }
    const data = req.body;
    try {

        const update_data = await video_info.findOneAndUpdate({ContentID:data.ContentID},{$set:data.new_data},{new: true});
        console.log("Updated Successfully...");
        res.status(200).json(update_data);
        return
    } catch (error) {
        console.log(error)
        res.status(500).json("Internal Server Error")
        return
    }
})

app.delete("/logout",isLoggedIn,(req,res)=>{
    if (req.session) {
        req.session.destroy();
        return res.status(200).json("LoggedOut");
      }
      else{
        return res.status(401).json("Notauthorized");
      }
})

// Start the Express application
app.listen(3000, () => console.log("Server started on port 3000"));