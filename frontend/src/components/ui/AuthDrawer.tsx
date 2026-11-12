import React from 'react'
import { AhovaDrawer } from './AhovaDrawer'
import { AuthForm } from '../auth/AuthForm'

interface AuthDrawerProps {
  open: boolean
  onClose: () => void
}

export const AuthDrawer: React.FC<AuthDrawerProps> = ({ open, onClose }) => (
  <AhovaDrawer open={open} onClose={onClose} title="Sign In">
    {open && <AuthForm onSuccess={onClose} />}
  </AhovaDrawer>
)
