import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/useAuth';
import RoleNavbar from '../components/RoleNavbar';
import { PageWrapper, PageMain } from '../components/ui';

function StaffDashboard() {
  const { user, logout } = useAuth();

  // Courses state
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(true);

  // Create course state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [assignedLecturerId, setAssignedLecturerId] = useState('');
  const [lecturers, setLecturers] = useState([]);
  const [creatingCourse, setCreatingCourse] = useState(false);

  // Students state
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Search & Enroll state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetchCourses();
    fetchLecturers();
  }, []);

  const fetchLecturers = async () => {
    try {
      const res = await api.get('/users?role=lecturer');
      setLecturers(res.data);
    } catch (err) {
      console.error('Error fetching lecturers', err);
    }
  };

  useEffect(() => {
    if (selectedCourse) {
      fetchStudents(selectedCourse.course_id);
    }
  }, [selectedCourse]);

  // Use debouncing for search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length > 0) {
        handleSearch(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const fetchCourses = async () => {
    try {
      setLoadingCourses(true);
      const res = await api.get('/courses');
      setCourses(res.data);
    } catch (err) {
      console.error('Error fetching courses:', err);
    } finally {
      setLoadingCourses(false);
    }
  };

  const fetchStudents = async (courseId) => {
    try {
      setLoadingStudents(true);
      const res = await api.get(`/courses/${courseId}/students`);
      setStudents(res.data);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleCreateCourse = async (e) => {
    e.preventDefault();
    if (!newCourseCode.trim() || !newCourseName.trim() || !assignedLecturerId) {
      alert("Please fill all fields and select a lecturer.");
      return;
    }

    try {
      setCreatingCourse(true);
      await api.post('/courses', {
        course_code: newCourseCode.trim(),
        course_name: newCourseName.trim(),
        assigned_lecturer_id: assignedLecturerId
      });
      setNewCourseCode('');
      setNewCourseName('');
      setAssignedLecturerId('');
      setShowCreateForm(false);
      fetchCourses();
    } catch (err) {
      console.error('Error creating course:', err);
      alert(err.response?.data?.error || 'Failed to create course');
    } finally {
      setCreatingCourse(false);
    }
  };

  const handleRemoveStudent = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to remove ${userName} from this course?`)) return;

    try {
      await api.delete(`/courses/${selectedCourse.course_id}/students/${userId}`);
      fetchStudents(selectedCourse.course_id);
      fetchCourses(); // to update the enrolled count on the left panel
    } catch (err) {
      console.error('Error removing student:', err);
      alert('Failed to remove student');
    }
  };

  const handleSearch = async (query) => {
    try {
      setSearching(true);
      const res = await api.get(`/users?search=${encodeURIComponent(query)}&role=student`);
      setSearchResults(res.data);
    } catch (err) {
      console.error('Error searching students:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleEnroll = async (userId) => {
    try {
      await api.post(`/courses/${selectedCourse.course_id}/enroll`, { user_id: userId });
      setSearchQuery('');
      setSearchResults([]);
      fetchStudents(selectedCourse.course_id);
      fetchCourses(); // update count
    } catch (err) {
      console.error('Error enrolling student:', err);
      alert(err.response?.data?.error || 'Failed to enroll student');
    }
  };

  return (
    <PageWrapper>
      <RoleNavbar
        user={user}
        role={user?.role || 'staff'}
        homePath="/staff/dashboard"
        links={[
          { key: 'staff-dashboard', label: 'Dashboard', to: '/staff/dashboard' },
          { key: 'staff-regulations', label: 'Regulations', to: '/regulations' }
        ]}
        onLogout={logout}
      />

      {/* Main Content */}
      <PageMain className="flex flex-col md:flex-row gap-6">
        
        {/* Left Panel - 40% */}
        <div className="w-full md:w-2/5 flex flex-col">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col">
            
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-bold text-gray-800">Courses</h2>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="text-sm px-3 py-2 bg-[#7A1F2E] text-white font-medium rounded-md hover:bg-[#601826] shadow-sm transition"
              >
                {showCreateForm ? 'Cancel' : '+ Create Course'}
              </button>
            </div>

            {showCreateForm && (
              <form onSubmit={handleCreateCourse} className="p-4 border-b border-gray-200 bg-[#FFF5F5]">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Course Code</label>
                    <input
                      type="text"
                      required
                      value={newCourseCode}
                      onChange={(e) => setNewCourseCode(e.target.value)}
                      placeholder="e.g. CS101"
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-[#7A1F2E] focus:border-[#7A1F2E]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Course Name</label>
                    <input
                      type="text"
                      required
                      value={newCourseName}
                      onChange={(e) => setNewCourseName(e.target.value)}
                      placeholder="e.g. Intro to Computer Science"
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-[#7A1F2E] focus:border-[#7A1F2E]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Assign Lecturer</label>
                    <select
                      required
                      value={assignedLecturerId}
                      onChange={(e) => setAssignedLecturerId(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-[#7A1F2E] focus:border-[#7A1F2E]"
                    >
                      <option value="" disabled>Select a lecturer</option>
                      {lecturers.map(l => (
                        <option key={l.id} value={l.id}>{l.username} ({l.email})</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={creatingCourse}
                    className="w-full mt-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition disabled:opacity-50"
                  >
                    {creatingCourse ? 'Saving...' : 'Save Course'}
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-y-auto flex-1 h-[600px]">
              {loadingCourses ? (
                <div className="p-8 text-center text-gray-500">Loading courses...</div>
              ) : courses.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No courses found.</div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {courses.map((course) => (
                    <li key={course.course_id}>
                      <button
                        onClick={() => setSelectedCourse(course)}
                        className={`w-full text-left p-4 hover:bg-gray-50 transition border-l-4 ${
                          selectedCourse?.course_id === course.course_id 
                            ? 'bg-blue-50 border-l-[#7A1F2E]' 
                            : 'border-l-transparent'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm font-bold text-gray-900">{course.course_code}</p>
                            <p className="text-sm text-gray-500">{course.course_name}</p>
                          </div>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {course.enrollment_count || 0} Enrolled
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - 60% */}
        <div className="w-full md:w-3/5 flex flex-col">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col">
            {!selectedCourse ? (
              <div className="flex-1 flex items-center justify-center p-8 text-gray-400">
                <p>Select a course from the left panel to manage enrollments.</p>
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-lg font-bold text-gray-800 flex items-center">
                    Students enrolled in <span className="ml-2 text-[#7A1F2E]">{selectedCourse.course_code} - {selectedCourse.course_name}</span>
                  </h2>
                </div>

                <div className="overflow-y-auto flex-1 max-h-[400px]">
                  {loadingStudents ? (
                    <div className="p-8 text-center text-gray-500">Loading students...</div>
                  ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-white sticky top-0">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matric</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Enrolled</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {students.length === 0 ? (
                          <tr>
                            <td colSpan="5" className="px-6 py-8 text-center text-gray-500 text-sm">
                              No students enrolled in this course yet.
                            </td>
                          </tr>
                        ) : (
                          students.map((student) => (
                            <tr key={student.user_id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {student.username}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {student.student_matric || 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {student.email}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {student.enrolled_at ? new Date(student.enrolled_at).toLocaleDateString() : 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button
                                  onClick={() => handleRemoveStudent(student.user_id, student.username)}
                                  className="text-sm font-medium text-red-600 bg-white border border-red-300 px-3 py-1 rounded hover:bg-red-50"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Enroll Section */}
                <div className="p-4 border-t border-gray-200 bg-gray-50 mt-auto">
                  <h3 className="text-sm font-bold text-gray-800 mb-2">Enroll a Student</h3>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search by username or matric number..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-[#7A1F2E] focus:border-[#7A1F2E]"
                    />
                    
                    {/* Search Results Dropdown */}
                    {searchQuery.trim().length > 0 && (
                      <div className="absolute bottom-full mb-1 left-0 z-50 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {searching ? (
                          <div className="p-3 text-sm text-gray-500 text-center">Searching...</div>
                        ) : searchResults.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500 text-center">No matching students found</div>
                        ) : (
                          <ul className="divide-y divide-gray-100">
                            {searchResults.map((user) => {
                              // Don't show students already enrolled
                              const isEnrolled = students.some(s => s.user_id === user.id);
                              
                              if (isEnrolled) return null;
                              
                              return (
                                <li key={user.id} className="flex justify-between items-center p-3 hover:bg-gray-50">
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">{user.username}</p>
                                    <p className="text-xs text-gray-500">
                                      {user.student_matric || 'No matric'} | {user.email}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleEnroll(user.id)}
                                    className="px-3 py-1 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700"
                                  >
                                    Enroll
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>

              </>
            )}
          </div>
        </div>

      </PageMain>
    </PageWrapper>
  );
}

export default StaffDashboard;