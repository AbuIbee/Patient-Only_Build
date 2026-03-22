import { useState, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { useSelectedPatient } from '@/hooks/useSelectedPatient';
import { getPatientNotes, addPatientNote, deletePatientNote } from '@/services/patientService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, MessageSquare, Trash2, Loader2, FileText, Heart, Activity, Brain } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { Note } from '@/types';

const noteTypeIcons = {
  general: MessageSquare,
  medical: FileText,
  mood: Heart,
  activity: Activity,
  behavior: Brain,
};

const noteTypeColors = {
  general: 'bg-blue-100 text-blue-700',
  medical: 'bg-red-100 text-red-700',
  mood: 'bg-pink-100 text-pink-700',
  activity: 'bg-green-100 text-green-700',
  behavior: 'bg-purple-100 text-purple-700',
};

export default function PatientTimeline() {
  const { state } = useApp();
  const selectedPatient = useSelectedPatient();
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState<Note['noteType']>('general');

  const loadNotes = async () => {
    if (!selectedPatient?.patient.id) return;
    
    setIsLoading(true);
    try {
      const patientNotes = await getPatientNotes(selectedPatient.patient.id);
      setNotes(patientNotes);
    } catch (error) {
      console.error('Error loading notes:', error);
      toast.error('Failed to load notes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPatient?.patient.id) {
      loadNotes();
    }
  }, [selectedPatient?.patient.id]);

  const handleAddNote = async () => {
    if (!newNote.trim() || !selectedPatient?.patient.id || !state.currentUser) {
      toast.error('Please enter a note');
      return;
    }

    setIsAddingNote(true);
    try {
      const note = await addPatientNote(
        selectedPatient.patient.id,
        state.currentUser.id,
        newNote.trim(),
        noteType
      );
      setNotes([note, ...notes]);
      setNewNote('');
      toast.success('Note added successfully');
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error('Failed to add note');
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      await deletePatientNote(noteId);
      setNotes(notes.filter(n => n.id !== noteId));
      toast.success('Note deleted');
    } catch (error) {
      console.error('Error deleting note:', error);
      toast.error('Failed to delete note');
    }
  };

  if (!selectedPatient) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-20 h-20 bg-soft-taupe/30 rounded-full flex items-center justify-center mb-4">
          <User className="w-10 h-10 text-medium-gray" />
        </div>
        <h2 className="text-xl font-semibold text-charcoal mb-2">No Patient Selected</h2>
        <p className="text-medium-gray text-center max-w-md">
          Please select a patient to view their timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-charcoal mb-1">
          {selectedPatient.patient.preferredName}&apos;s Timeline
        </h1>
        <p className="text-medium-gray">
          Care notes and observations over time
        </p>
      </div>

      {/* Add Note Section */}
      <Card className="border-0 shadow-soft">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-warm-bronze" />
            <span className="font-medium text-charcoal">Add New Note</span>
          </div>
          
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Write a note about the patient's condition, behavior, or activities..."
            rows={3}
          />
          
          <div className="flex items-center justify-between">
            <Select value={noteType} onValueChange={(v) => setNoteType(v as Note['noteType'])}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Note type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="medical">Medical</SelectItem>
                <SelectItem value="mood">Mood</SelectItem>
                <SelectItem value="activity">Activity</SelectItem>
                <SelectItem value="behavior">Behavior</SelectItem>
              </SelectContent>
            </Select>
            
            <Button
              onClick={handleAddNote}
              disabled={isAddingNote || !newNote.trim()}
              className="bg-warm-bronze hover:bg-deep-bronze text-white"
            >
              {isAddingNote ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Note'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notes Timeline */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-charcoal">Care Notes</h2>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-warm-bronze" />
          </div>
        ) : notes.length === 0 ? (
          <Card className="border-0 shadow-soft">
            <CardContent className="p-8 text-center">
              <MessageSquare className="w-12 h-12 text-soft-taupe mx-auto mb-4" />
              <p className="text-medium-gray">No notes yet</p>
              <p className="text-sm text-medium-gray mt-1">
                Add your first note to start tracking care
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => {
              const Icon = noteTypeIcons[note.noteType];
              const colorClass = noteTypeColors[note.noteType];
              
              return (
                <Card key={note.id} className="border-0 shadow-soft">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${colorClass}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-char capitalize">
                              {note.noteType}
                            </span>
                            <span className="text-medium-gray">•</span>
                            <span className="text-sm text-medium-gray">
                              {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteNote(note.id)}
                            className="text-gentle-coral hover:text-gentle-coral/80 h-8 w-8"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <p className="text-charcoal whitespace-pre-wrap">{note.note}</p>
                        <div className="flex items-center gap-2 mt-3 text-sm text-medium-gray">
                          <User className="w-4 h-4" />
                          <span>By {note.caregiverName}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}