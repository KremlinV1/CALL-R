"use client"

import { useState, useCallback, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Upload,
  FileSpreadsheet,
  Check,
  X,
  AlertCircle,
  CheckCircle,
  Loader2,
  Phone,
  Mail,
  Building,
  User,
  Briefcase,
  MapPin,
  List,
} from "lucide-react"

interface ContactList {
  id: string
  name: string
  color: string
  contactCount?: number
}

interface UploadWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (contacts: Record<string, string>[], tags: string[], skipDuplicates: boolean, listId?: string) => void
  isSubmitting?: boolean
  contactLists?: ContactList[]
  defaultListId?: string | null
}

interface ColumnConfig {
  key: string
  label: string
  type: "phone" | "email" | "text"
  required: boolean
  icon: React.ReactNode
}

const TEMPLATE_COLUMNS: ColumnConfig[] = [
  { key: "phone", label: "Phone Number", type: "phone", required: true, icon: <Phone className="h-3 w-3" /> },
  { key: "firstName", label: "First Name", type: "text", required: false, icon: <User className="h-3 w-3" /> },
  { key: "lastName", label: "Last Name", type: "text", required: false, icon: <User className="h-3 w-3" /> },
  { key: "email", label: "Email", type: "email", required: false, icon: <Mail className="h-3 w-3" /> },
  { key: "company", label: "Business Name", type: "text", required: false, icon: <Building className="h-3 w-3" /> },
  { key: "jobTitle", label: "Job Title", type: "text", required: false, icon: <Briefcase className="h-3 w-3" /> },
  { key: "address", label: "Street Address", type: "text", required: false, icon: <MapPin className="h-3 w-3" /> },
]

type WizardStep = "upload" | "header" | "mapping" | "review"

export function UploadWizard({ open, onOpenChange, onSubmit, isSubmitting, contactLists = [], defaultListId }: UploadWizardProps) {
  const [step, setStep] = useState<WizardStep>("upload")
  const [rawData, setRawData] = useState<string[][]>([])
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [mappedData, setMappedData] = useState<Record<string, string>[]>([])
  const [errors, setErrors] = useState<{ row: number; field: string; value: string; message: string }[]>([])
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [uploadTags, setUploadTags] = useState("")
  const [dragActive, setDragActive] = useState(false)
  const [selectedListId, setSelectedListId] = useState<string>(defaultListId || "")
  const [hasSubmitted, setHasSubmitted] = useState(false)

  // Reset wizard state when dialog opens
  useEffect(() => {
    if (open) {
      // Reset to initial state when opening
      setSelectedListId(defaultListId || "")
      setHasSubmitted(false)
    } else {
      // Reset everything when dialog closes
      setStep("upload")
      setRawData([])
      setHeaderRowIndex(0)
      setColumnMapping({})
      setMappedData([])
      setErrors([])
      setSelectedRows(new Set())
      setSkipDuplicates(true)
      setUploadTags("")
      setDragActive(false)
      setSelectedListId("")
      setHasSubmitted(false)
    }
  }, [open, defaultListId])

  const resetWizard = () => {
    setStep("upload")
    setRawData([])
    setHeaderRowIndex(0)
    setColumnMapping({})
    setMappedData([])
    setErrors([])
    setSelectedRows(new Set())
    setSkipDuplicates(true)
    setUploadTags("")
    setDragActive(false)
    setSelectedListId(defaultListId || "")
    setHasSubmitted(false)
  }

  const handleClose = () => {
    resetWizard()
    onOpenChange(false)
  }

  // Parse CSV text
  const parseCSV = (text: string): string[][] => {
    const lines = text.trim().split('\n')
    return lines.map(line => {
      const values: string[] = []
      let current = ''
      let inQuotes = false
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^"|"$/g, ''))
          current = ''
        } else {
          current += char
        }
      }
      values.push(current.trim().replace(/^"|"$/g, ''))
      return values
    })
  }

  // Handle file drop/select
  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const parsed = parseCSV(text)
      if (parsed.length > 0) {
        setRawData(parsed)
        setStep("header")
      }
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.tsv'))) {
      handleFile(file)
    }
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragActive(false)
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  // Header selection
  const handleSelectHeader = (index: number) => {
    setHeaderRowIndex(index)
  }

  const proceedToMapping = () => {
    const headers = rawData[headerRowIndex] || []
    // Auto-map columns based on header names
    const autoMapping: Record<string, string> = {}
    headers.forEach((header, idx) => {
      const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (normalized.includes('phone') || normalized.includes('mobile') || normalized.includes('cell')) {
        autoMapping.phone = idx.toString()
      } else if (normalized.includes('first') || normalized === 'fname') {
        autoMapping.firstName = idx.toString()
      } else if (normalized.includes('last') || normalized === 'lname') {
        autoMapping.lastName = idx.toString()
      } else if (normalized.includes('email')) {
        autoMapping.email = idx.toString()
      } else if (normalized.includes('company') || normalized.includes('business') || normalized.includes('organization')) {
        autoMapping.company = idx.toString()
      } else if (normalized.includes('title') || normalized.includes('job')) {
        autoMapping.jobTitle = idx.toString()
      } else if (normalized.includes('address') || normalized.includes('street')) {
        autoMapping.address = idx.toString()
      }
    })
    setColumnMapping(autoMapping)
    setStep("mapping")
  }

  // Get sample data for a column
  const getSampleData = (colIndex: number): string[] => {
    const samples: string[] = []
    for (let i = headerRowIndex + 1; i < Math.min(rawData.length, headerRowIndex + 5); i++) {
      if (rawData[i]?.[colIndex]) {
        samples.push(rawData[i][colIndex])
      }
    }
    return samples
  }

  // Phone number validation and formatting
  const formatPhoneNumber = (phone: string): string => {
    // Check if already formatted with +1
    if (phone.startsWith('+1')) {
      return phone
    }
    
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '')
    
    // If 10 digits (US number without country code), prepend +1
    if (cleaned.length === 10) {
      return `+1${cleaned}`
    }
    
    // If 11 digits starting with 1, replace with +1
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+1${cleaned.slice(1)}`
    }
    
    // Return original if doesn't match expected patterns
    return phone
  }

  const isValidPhone = (phone: string): boolean => {
    const cleaned = phone.replace(/\D/g, '')
    return cleaned.length >= 10 && cleaned.length <= 15
  }

  const isValidEmail = (email: string): boolean => {
    if (!email) return true // Optional
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  // Process mapping and validate
  const proceedToReview = () => {
    const headers = rawData[headerRowIndex] || []
    const dataRows = rawData.slice(headerRowIndex + 1)
    const mapped: Record<string, string>[] = []
    const validationErrors: typeof errors = []

    dataRows.forEach((row, rowIdx) => {
      const contact: Record<string, string> = {}
      
      TEMPLATE_COLUMNS.forEach(col => {
        const colIdx = columnMapping[col.key]
        if (colIdx !== undefined && colIdx !== "") {
          contact[col.key] = row[parseInt(colIdx)] || ""
        }
      })

      // Auto-format phone number
      if (contact.phone) {
        contact.phone = formatPhoneNumber(contact.phone)
      }

      // Validate phone
      if (!contact.phone) {
        validationErrors.push({
          row: rowIdx,
          field: "phone",
          value: "",
          message: "Missing phone number"
        })
      } else if (!isValidPhone(contact.phone)) {
        validationErrors.push({
          row: rowIdx,
          field: "phone",
          value: contact.phone,
          message: "Invalid phone format"
        })
      }

      // Validate email
      if (contact.email && !isValidEmail(contact.email)) {
        validationErrors.push({
          row: rowIdx,
          field: "email",
          value: contact.email,
          message: "Invalid email format"
        })
      }

      mapped.push(contact)
    })

    setMappedData(mapped)
    setErrors(validationErrors)
    setStep("review")
  }

  // Fix formatting errors
  const fixAllFormattingErrors = () => {
    const updated = [...mappedData]
    const remainingErrors: typeof errors = []

    errors.forEach(err => {
      if (err.field === "phone" && err.value) {
        const formatted = formatPhoneNumber(err.value)
        if (isValidPhone(formatted.replace(/\D/g, ''))) {
          updated[err.row].phone = formatted
        } else {
          remainingErrors.push(err)
        }
      } else {
        remainingErrors.push(err)
      }
    })

    setMappedData(updated)
    setErrors(remainingErrors)
  }

  // Delete selected rows
  const deleteSelectedRows = () => {
    const newData = mappedData.filter((_, idx) => !selectedRows.has(idx))
    const newErrors = errors
      .filter(e => !selectedRows.has(e.row))
      .map(e => {
        let newRow = e.row
        selectedRows.forEach(selectedIdx => {
          if (selectedIdx < e.row) newRow--
        })
        return { ...e, row: newRow }
      })
    setMappedData(newData)
    setErrors(newErrors)
    setSelectedRows(new Set())
  }

  // Submit
  const handleSubmit = () => {
    if (hasSubmitted) {
      console.log('⚠️ Prevented duplicate submission')
      return
    }
    
    setHasSubmitted(true)
    
    // Filter out rows with critical errors (missing phone)
    const validContacts = mappedData.filter((contact, idx) => {
      return contact.phone && isValidPhone(contact.phone)
    })
    
    const tags = uploadTags ? uploadTags.split(",").map(t => t.trim()).filter(Boolean) : []
    const listIdToSend = selectedListId || undefined
    console.log('📤 Submitting with listId:', listIdToSend, 'selectedListId:', selectedListId)
    onSubmit(validContacts, tags, skipDuplicates, listIdToSend)
  }

  const headers = rawData[headerRowIndex] || []
  const phoneErrors = errors.filter(e => e.field === "phone").length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Upload a file"}
            {step === "header" && "Select header row"}
            {step === "mapping" && "Map columns"}
            {step === "review" && "Review and edit data"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="flex gap-6 h-full">
              <div className="w-64 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Please ensure your file contains the required columns.
                </p>
                
                {/* List Selection */}
                {contactLists.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Add to List</h4>
                    <Select
                      value={selectedListId || "_all"}
                      onValueChange={(value) => setSelectedListId(value === "_all" ? "" : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a list" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">
                          <div className="flex items-center gap-2">
                            <List className="h-3 w-3" />
                            All Contacts
                          </div>
                        </SelectItem>
                        {contactLists.map((list) => (
                          <SelectItem key={list.id} value={list.id}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-2 h-2 rounded-full" 
                                style={{ backgroundColor: list.color }}
                              />
                              {list.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-medium mb-2">Required columns</h4>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded">
                    <span className="text-sm">Phone Number</span>
                    <Badge variant="secondary" className="text-xs">Phone</Badge>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">Optional columns</h4>
                  <div className="space-y-2">
                    {TEMPLATE_COLUMNS.filter(c => !c.required).map(col => (
                      <div key={col.key} className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm">
                        <span>{col.label}</span>
                        <Badge variant="outline" className="text-xs capitalize">{col.type}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex-1">
                <div
                  className={`relative h-64 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-4 transition-colors cursor-pointer ${
                    dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => document.getElementById('file-upload-input')?.click()}
                >
                  <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-medium">Click here or drag and drop a file</p>
                    <p className="text-sm text-muted-foreground">You can upload CSV, XLSX, XLS, or TSV</p>
                  </div>
                </div>
                <input
                  id="file-upload-input"
                  type="file"
                  accept=".csv,.tsv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>
            </div>
          )}

          {/* Step 2: Header Selection */}
          {step === "header" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Select the header row</p>
              <ScrollArea className="h-[400px] border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      {rawData[0]?.map((_, idx) => (
                        <TableHead key={idx} className="min-w-[120px]">
                          {String.fromCharCode(65 + idx)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rawData.slice(0, 10).map((row, rowIdx) => (
                      <TableRow
                        key={rowIdx}
                        className={`cursor-pointer ${headerRowIndex === rowIdx ? "bg-primary/10" : "hover:bg-muted/50"}`}
                        onClick={() => handleSelectHeader(rowIdx)}
                      >
                        <TableCell>
                          {headerRowIndex === rowIdx && <Check className="h-4 w-4 text-primary" />}
                        </TableCell>
                        {row.map((cell, cellIdx) => (
                          <TableCell key={cellIdx} className="font-mono text-sm truncate max-w-[150px]">
                            {cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}

          {/* Step 3: Column Mapping */}
          {step === "mapping" && (
            <ScrollArea className="h-[400px]">
              <div className="space-y-4 pr-4">
                {TEMPLATE_COLUMNS.map(col => (
                  <div key={col.key} className="flex items-start gap-4 py-3 border-b">
                    <div className="w-48 flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {col.label}
                        {col.required && <span className="text-red-500">*</span>}
                      </span>
                      <Badge variant="secondary" className="text-xs capitalize">{col.type}</Badge>
                    </div>
                    
                    <div className="w-48">
                      <Select
                        value={columnMapping[col.key] || "_none"}
                        onValueChange={(value) => setColumnMapping(prev => ({ ...prev, [col.key]: value === "_none" ? "" : value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a column" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">-- None --</SelectItem>
                          {headers.map((header, idx) => (
                            <SelectItem key={idx} value={idx.toString()}>
                              {header || `Column ${idx + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex-1">
                      {columnMapping[col.key] && columnMapping[col.key] !== "" ? (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <div className="flex gap-2 flex-wrap">
                            {getSampleData(parseInt(columnMapping[col.key])).map((sample, i) => (
                              <Badge key={i} variant="outline" className="text-xs font-mono">
                                {sample.slice(0, 20)}{sample.length > 20 ? "..." : ""}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Select a column to show sample data
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Step 4: Review */}
          {step === "review" && (
            <div className="flex gap-4 h-[400px]">
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full border rounded">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>First Name</TableHead>
                        <TableHead>Last Name</TableHead>
                        <TableHead>
                          Phone Number
                          {phoneErrors > 0 && (
                            <Badge variant="destructive" className="ml-2">{phoneErrors}</Badge>
                          )}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mappedData.slice(0, 100).map((contact, idx) => {
                        const hasError = errors.some(e => e.row === idx)
                        return (
                          <TableRow 
                            key={idx}
                            className={hasError ? "bg-red-50 dark:bg-red-950/20" : ""}
                          >
                            <TableCell className="font-mono text-xs">{idx + 1}</TableCell>
                            <TableCell>{contact.firstName}</TableCell>
                            <TableCell>{contact.lastName}</TableCell>
                            <TableCell className="font-mono">{contact.phone}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              <div className="w-72 space-y-4">
                <div className="p-4 border rounded space-y-3">
                  <h4 className="font-medium">Errors</h4>
                  
                  {phoneErrors > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Phone Number</span>
                        <Badge variant="destructive">{phoneErrors}</Badge>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="w-full"
                        onClick={fixAllFormattingErrors}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Fix all formatting errors
                      </Button>
                    </div>
                  )}

                  {errors.length === 0 && (
                    <p className="text-sm text-green-600 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      No errors found
                    </p>
                  )}
                </div>

                <div className="p-4 border rounded space-y-3">
                  <h4 className="font-medium">Summary</h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Total rows:</span>
                      <span className="font-medium">{mappedData.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Valid:</span>
                      <span className="font-medium text-green-600">
                        {mappedData.length - errors.filter(e => e.field === "phone").length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>With errors:</span>
                      <span className="font-medium text-red-600">{phoneErrors}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="skipDuplicates" 
                    checked={skipDuplicates}
                    onCheckedChange={(checked) => setSkipDuplicates(!!checked)}
                  />
                  <label htmlFor="skipDuplicates" className="text-sm">
                    Skip duplicate phone numbers
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t mt-4">
          <div>
            {step !== "upload" && (
              <Button
                variant="outline"
                onClick={() => {
                  if (step === "header") setStep("upload")
                  else if (step === "mapping") setStep("header")
                  else if (step === "review") setStep("mapping")
                }}
              >
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            {step === "header" && (
              <Button onClick={proceedToMapping}>Continue</Button>
            )}
            {step === "mapping" && (
              <Button 
                onClick={proceedToReview}
                disabled={!columnMapping.phone}
              >
                Review data
              </Button>
            )}
            {step === "review" && (
              <Button 
                onClick={handleSubmit}
                disabled={isSubmitting || mappedData.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  "Submit"
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
