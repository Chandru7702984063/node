const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const app = express();
const port = 3000;

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session setup
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true,
  store: MongoStore.create({ mongoUrl: 'mongodb://localhost:27017/institute' })
}));

// Ensure uploads and reports directories exist
const ensureDirectoryExistence = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};
ensureDirectoryExistence('uploads');
ensureDirectoryExistence('reports');

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/institute')
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch(err => {
    console.error('Connection error:', err);
  });

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Mongoose schemas and models
const studentSchema = new mongoose.Schema({
  srNo: String,
  collegeName: String,
  zone: String,
  name: String,
  email: String,
  contactNumber: String,
  tenthPercentage: String,
  tenthYearOfPassing: String,
  twelfthPercentage: String,
  twelfthYearOfPassing: String,
  diplomaPercentage: String,
  diplomaYOP: String,
  degree: String,
  stream: String,
  degreePercentage: String,
  degreeYOP: String,
  pgDegree: String,
  pgStream: String,
  postGradPercentage: String,
  pgYOP: String,
  currentBacklog: String,
  remarks: String,
  gender: String,
  btechCollegeState: String,
  btechRollNumber: String,
  referBy: String,
  pdf: String,
  programType: String // Add this line
});

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String
});

const Student = mongoose.model('Student', studentSchema);
const User = mongoose.model('User', userSchema);

// Authentication Middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
};

// Routes
app.get('/', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'signup.html'));
});

app.get('/student/register', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'student_registration.html'));
});

app.get('/student/retrieve', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'retrieve_student.html'));
});

app.get('/student/report', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'download_report.html'));
});

app.post('/signup', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.send('User registered successfully');
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).send('Error signing up');
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (isMatch) {
        req.session.user = user;
        return res.redirect('/');
      } else {
        res.status(401).send('Invalid credentials');
      }
    } else {
      res.status(401).send('User not found');
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send('Error logging in');
  }
});

app.post('/student/register', isAuthenticated, upload.single('pdf'), async (req, res) => {
  try {
    const studentData = req.body;
    const pdfPath = req.file ? req.file.path : '';
    const student = new Student({ ...studentData, pdf: pdfPath });
    await student.save();
    res.send('Student registered successfully');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error registering student');
  }
});

app.get('/student', isAuthenticated, async (req, res) => {
  try {
    const { srNo } = req.query;
    const student = await Student.findOne({ srNo: srNo });
    if (student) {
      res.json(student);
    } else {
      res.status(404).send('Student not found');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving student');
  }
});

// Route to filter students by college name and/or program type
app.get('/student/filter', isAuthenticated, async (req, res) => {
  try {
    const { filterCollege, filterProgramType } = req.query;
    const filter = {};

    if (filterCollege) {
      filter.collegeName = new RegExp(filterCollege, 'i'); // Case-insensitive regex search
    }

    if (filterProgramType) {
      filter.programType = filterProgramType;
    }

    const students = await Student.find(filter);
    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error filtering students');
  }
});

app.get('/student/report', isAuthenticated, async (req, res) => {
  try {
    const { srNo } = req.query;
    const student = await Student.findOne({ srNo: srNo });
    if (student) {
      const doc = new PDFDocument();
      const fileName = `student_report_${srNo}.pdf`;
      const filePath = path.join(__dirname, 'reports', fileName);

      doc.pipe(fs.createWriteStream(filePath));
      doc.text(`Sr.No: ${student.srNo}`);
      doc.text(`College Name: ${student.collegeName}`);
      doc.text(`Zone (State Name): ${student.zone}`);
      doc.text(`Name: ${student.name}`);
      doc.text(`Email ID: ${student.email}`);
      doc.text(`Contact Number: ${student.contactNumber}`);
      doc.text(`10th %: ${student.tenthPercentage}`);
      doc.text(`10th Year of Passing: ${student.tenthYearOfPassing}`);
      doc.text(`12th %: ${student.twelfthPercentage}`);
      doc.text(`12th Year of Passing: ${student.twelfthYearOfPassing}`);
      doc.text(`Diploma %: ${student.diplomaPercentage}`);
      doc.text(`Diploma YOP: ${student.diplomaYOP}`);
      doc.text(`Degree: ${student.degree}`);
      doc.text(`Stream (B.Tech Branch): ${student.stream}`);
      doc.text(`Degree %: ${student.degreePercentage}`);
      doc.text(`Degree YOP: ${student.degreeYOP}`);
      doc.text(`PG Degree: ${student.pgDegree}`);
      doc.text(`PG Stream: ${student.pgStream}`);
      doc.text(`Post Grad %: ${student.postGradPercentage}`);
      doc.text(`PG YOP: ${student.pgYOP}`);
      doc.text(`Whether having current backlog: ${student.currentBacklog}`);
      doc.text(`Remarks: ${student.remarks}`);
      doc.text(`Gender: ${student.gender}`);
      doc.text(`Btech College State: ${student.btechCollegeState}`);
      doc.text(`Btech Roll Number: ${student.btechRollNumber}`);
      doc.text(`Refer By: ${student.referBy}`);
      doc.end();

      doc.on('finish', () => {
        res.download(filePath, fileName, (err) => {
          if (err) {
            console.error('Error downloading the file:', err);
            res.status(500).send('Error downloading the file');
          } else {
            console.log('File downloaded successfully');
          }
        });
      });
    } else {
      res.status(404).send('Student not found');
    }
  } catch (err) {
    console.error('Error generating report:', err);
    res.status(500).send('Error generating report');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
