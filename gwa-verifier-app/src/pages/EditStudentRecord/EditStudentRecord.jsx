import React, { useState, useEffect, useMemo } from "react";
import { Container } from "@mui/material";
import { useParams, useNavigate } from "react-router-dom";
import CircularProgress from "@mui/material/CircularProgress";
import StudentRecordForm from "Components/StudentRecordForm/";
import GradeRecordTable from "Components/GradeRecordTable";
import Box from "@mui/material/Box";
import StudentFormFooter from "Components/StudentFormFooter";
import { StudentHandler, RecordHandler, CommentHandler } from "../../handlers";
import { Verifiers } from "../../utils/verifiers.js";
import { fromMapToArray } from "../../utils/transformers.js";
import * as validators from "../../utils/validators.js";
import ForceSaveDialog from "Components/ForceSaveDialog";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import { useSnackbar } from "notistack";
import { v4 as uuidv4 } from "uuid";
import { useAuth } from "../../context/AuthContext.jsx";

/*
  Page: Edit Student Record Page
  Description:
    This page allows the committee user to edit an existing record in the database. Most features in the add student record page are also available in this page

  Features:
    1. Record checking in an excel-like manner wherein grade records are displayed on a table with editable cells
    2. A two-step verifcation process wherein the data is checked locally first before double-checked by the backend
    3. Committee user can either check first if the record is valid and savable or force save the record without validating its content.
*/
function EditStudentRecord() {
  const {
    user: { email },
  } = useAuth();
  const params = useParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [saving, setSaving] = useState(false);
  const [studentRecord, setStudentRecord] = useState({});
  const [terms, setTerms] = useState([""]);
  const [term, setTerm] = useState("");

  const [gradeRecords, setGradeRecords] = useState({});
  const [comment, setComment] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [studentInfoErrors, setStudentInfoErrors] = useState([]);
  const [studentRecordErrors, setStudentRecordErrors] = useState([]);

  const [recordsToDelete, setRecordsToDelete] = useState([]);

  const [showForceSave, setShowForceSave] = useState(false);

  function handleGradeRecordChange({ uid, columnId, value }) {
    const record = gradeRecords[uid];

    if (!record) return;
    Object.assign(record, {
      [columnId]: value,
    });
    setGradeRecords({ ...gradeRecords, [uid]: record });
  }
  async function fetchCourses() {
    const handler = new RecordHandler();
    try {
      const [newTerms, coursesMap] = await handler.fetchCourses(studno);

      setTerms(newTerms);
      setTerm(newTerms[0]);
      setGradeRecords(coursesMap);
    } catch (error) {
      console.warn(error);
    }
  }

  const convertedGrades = useMemo(() => {
    const records = fromMapToArray(gradeRecords, "uid").filter(
      (record) => record.term === term
    );
    return records;
  }, [gradeRecords, term]);

  function handleCommentChange(newComment) {
    setComment(newComment);
  }

  function goBack() {
    // navigate back to previous page
    navigate(-2);
  }

  function addRow() {
    const newRecord = {
      term,
      courseno: "",
      grade: "",
      units: "",
      enrolled: "",
      running_total: "",
    };
    const grUid = uuidv4();
    setGradeRecords({
      ...gradeRecords,
      [grUid]: newRecord,
    });
  }

  function deleteRow(uid) {
    const gradeRecordCopy = { ...gradeRecords };
    if (!gradeRecordCopy[uid]) return;
    // if the uid is an ID from the database
    if (validators.idRegex.test(uid)) {
      setRecordsToDelete([...recordsToDelete, uid]);
    }
    delete gradeRecordCopy[uid];
    setGradeRecords(gradeRecordCopy);
  }

  async function safeSave() {
    // save the data w/ respect to the current page
    const verifiers = new Verifiers();

    console.log("SAVING?");

    let { studNo: studno, recommended, degree } = studentRecord;
    // input validation for student info

    if (
      !validators.studentNoRegex.test(studno) ||
      !validators.recommendedUnitsRegex.test(recommended)
    ) {
      enqueueSnackbar("Cannot save all students, some still have errors", {
        variant: "error",
      });
      return;
    }

    studno = studno.split("-").join("");

    let gradeRecordsReady = [];

    // verify student records / grade records locally
    try {
      console.log(
        "🚀 ~ file: EditStudentRecord.jsx ~ line 135 ~ safeSave ~ gradeRecords",
        gradeRecords
      );
      gradeRecordsReady = await verifiers.locallyVerifyGradeRecords({
        gradeRecords,
      });
      console.log(
        "🚀 ~ file: EditStudentRecord.jsx ~ line 139 ~ safeSave ~ gradeRecordsReady",
        gradeRecordsReady
      );
    } catch (error) {
      console.warn(error);

      enqueueSnackbar(
        "Cannot save all student records, some still have errors",
        {
          variant: "error",
        }
      );
      return;
    }
    let gwa = 0;
    let total_units_taken = 0;
    setSaving(true);
    // verify if student records are valid by sending a request to the backend
    try {
      const response = await verifiers.verifyStudentRecords({
        studno,
        degree,
        gradeRecordsReady,
        recommended,
      });
      gwa = response.gwa;
      total_units_taken = response.total_units_taken;
    } catch (error) {
      console.warn(error);
      if (error && error.length) {
        const [studentInfoErrors, studentRecordErrors] = error;
        setStudentInfoErrors(studentInfoErrors);
        setStudentRecordErrors(studentRecordErrors);
        enqueueSnackbar("Errors in student records. Please see message", {
          variant: "error",
        });
      } else {
        // assume that the error is plaintext
        enqueueSnackbar(
          error.message || "Invalid records, please check logs.",
          {
            variant: "error",
          }
        );
      }
      setSaving(false);
      return;
    }
    handleSave({
      gradeRecordsReady,
      status: studentRecord.status,
      gwa,
      total_units_taken,
    });
  }

  async function forceSave() {
    // save the data w/ respect to the current page
    const verifiers = new Verifiers();

    const { studNo: studno, recommended } = studentRecord;
    // input validation for student info

    if (!verifiers.locallyVerifyStudent({ studno, recommended })) {
      enqueueSnackbar("Cannot save all students, some still have errors", {
        variant: "error",
      });
      return;
    }

    let gradeRecordsReady = [];

    // verify student records / grade records locally
    try {
      gradeRecordsReady = await verifiers.locallyVerifyGradeRecords({
        gradeRecords,
      });
    } catch (error) {
      console.warn(error);
      enqueueSnackbar(
        "Cannot save all student records, some still have errors",
        {
          variant: "error",
        }
      );
      return;
    }

    handleSave({ gradeRecordsReady });
  }

  /**
   *
   * @param {Object} param0
   * @param {Array<GradeRecord>} param0.gradeRecordsReady
   * @param {string} param0.status
   * @param {number} gwa
   * @param {number} total_units_taken
   * @param {number | string} recommended
   * @returns
   */
  async function handleSave({
    gradeRecordsReady,
    status = "INCOMPLETE",
    gwa = 0,
    total_units_taken = 0,
  }) {
    const studentHandler = new StudentHandler();
    const recordHandler = new RecordHandler();
    const commentHandler = new CommentHandler();

    const { studNo: studno, old_studNo } = studentRecord;
    const newStudNo = studno.split("-").join("");
    const oldStudNo = old_studNo.split("-").join("");

    setSaving(true);

    try {
      // creating student record info is working
      await studentHandler.updateInfo({
        studentRecord: {
          ...studentRecord,
          old_stud_no: oldStudNo,
          new_stud_no: newStudNo,
          status,
          gwa,
          cred_units: total_units_taken,
        },

        email,
      });

      // ready the data
    } catch (error) {
      console.warn(error);
      enqueueSnackbar(`Error in saving record: ${error}`, {
        variant: "error",
      });
      setSaving(false);
      setShowForceSave(false);
      return;
    }

    // delete records to be deleted

    try {
      if (recordsToDelete.length > 0)
        await recordHandler.deleteGradeRecords(recordsToDelete);
    } catch (error) {
      console.warn(error);
      console.warn("Cannot delete records");
    }

    // save grade records
    try {
      // creating student record info is working

      const recordsToSave = [];
      const recordsToUpdate = [];

      gradeRecordsReady.forEach((record) => {
        const { id, total, courseno, ...rest } = record;

        if (validators.idRegex.test(id)) {
          recordsToUpdate.push({
            ...rest,
            id,
            course_number: courseno,
            running_total: total,
            student_number: newStudNo,
          });
          return;
        }
        recordsToSave.push({
          ...rest,
          total,
          courseno,
        });
      });

      // update existing records
      await recordHandler.updateGradeRecords({
        studno: newStudNo,
        lst: recordsToUpdate,
      });
      await recordHandler.saveGradeRecords({
        studno: newStudNo,
        email,
        lst: recordsToSave,
      });

      // ready the data
    } catch (error) {
      console.warn(error);
      enqueueSnackbar(`Error in saving record: ${error}`, {
        variant: "error",
      });
      return;
    }

    // // save comments (if any)
    if (comment.trim() !== "") {
      try {
        await commentHandler.save({
          email,
          studno: newStudNo,
          comment: comment.trim(),
        });
      } catch (error) {}
    }

    enqueueSnackbar(`Student successfully saved.`, {
      variant: "success",
    });
    setSaving(false);
    setShowForceSave(false);
    goBack();
  }

  async function getStudentInfo() {
    const handler = new StudentHandler();
    try {
      const student = await handler.getInfo({ studno });

      const { studNo: old_studNo } = student;
      setStudentRecord({
        ...student,
        old_studNo,
      });
      setLoaded(true);
    } catch (error) {
      console.warn(error);
      enqueueSnackbar("Student not found", { variant: "error" });
      goBack();
    }
  }

  /**
   * @param {Object} kwargs
   * @param {string} kwargs.title
   * @param {string[]} kwargs.messages
   */
  function renderErrors({ title, messages }) {
    const listItems =
      messages.length !== 0
        ? messages.map((message, idx) => <li key={idx}>{message}</li>)
        : null;
    return listItems && listItems.length > 0 ? (
      <Alert severity="error">
        <AlertTitle>{title}</AlertTitle>
        <ul>{listItems}</ul>
      </Alert>
    ) : null;
  }

  function handleStudentInfoChange({ name, value }) {
    setStudentRecord({ ...studentRecord, [name]: value });
  }

  const { id: studno } = params;

  useEffect(() => {
    // console.log(
    //   `${studno.toString().slice(0, 4)}-${studno.toString().slice(4)}`
    // );
    fetchCourses();
    getStudentInfo();
  }, []);
  return (
    <>
      <Container sx={{ paddingTop: 5, paddingBottom: 5 }}>
        {/* <Typography variant="h1">
          Edit student record page w/ the ff. url parameter: {id}
        </Typography> */}
        {!loaded && Object.keys(studentRecord).length === 0 ? (
          <Box sx={{ display: "flex" }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {renderErrors({
              title: "Error in student information",
              messages: studentInfoErrors,
            })}
            <StudentRecordForm
              loading={saving}
              firstName={studentRecord.fname}
              middleName={studentRecord.mname}
              lastName={studentRecord.lname}
              suffix={studentRecord.suffix}
              studNo={studentRecord.studNo}
              degree={studentRecord.degree}
              recommended={studentRecord.recommended}
              handleInputChange={handleStudentInfoChange}
              handleComment={handleCommentChange}
              comment={comment}
              terms={terms}
              term={term}
              setTerm={setTerm}
              handleAddRow={addRow}
              extraFeaturesEnabled={false}
              table={
                <>
                  {renderErrors({
                    title: "Error in grades",
                    messages: studentRecordErrors,
                  })}
                  <GradeRecordTable
                    data={convertedGrades}
                    handleUpdate={handleGradeRecordChange}
                    handleDelete={deleteRow}
                  />
                </>
              }
              footer={
                <StudentFormFooter
                  popStack={() => navigate(-1)}
                  onSave={safeSave}
                  loading={saving}
                  cb={() => setShowForceSave(true)}
                />
              }
            />
          </>
        )}
      </Container>
      <ForceSaveDialog
        open={showForceSave}
        handleCancel={() => setShowForceSave(false)}
        onSuccess={forceSave}
      />
    </>
  );
}

export default EditStudentRecord;
